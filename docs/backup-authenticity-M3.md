# M3 — Device-Origin Backup Authenticity (Design / Defer)

**Status:** Design only. The claim in `backupEngine.js` has been corrected to
stop overstating the guarantee; the actual device-origin signature is
**deferred** (rationale below). This doc is the spec for whoever implements it.

**Companion to:** `SECURITY-AUDIT.md` (finding M3).

---

## The finding

Backups are signed with an HMAC-SHA-256 key derived from the operator
passphrase (`deriveHmacKey(passphrase)` in `cryptoEngine.js`). Therefore a valid
signature proves only:

> "This backup was produced by **someone who holds the passphrase**."

It does **not** prove:

> "This backup was produced by **the origin device / a legitimate operator**."

Anyone who knows the passphrase can fabricate a backup with any record set and
sign it validly. Against an insider (or anyone who has learned the passphrase),
the signature is authenticity *theater* — it detects outside tampering of a file
in transit, but not forgery by a passphrase-holder.

This is consistent with the current design (the HMAC is domain-separated and
correctly implemented for *tamper-evidence*); the issue is only that the
authenticity claim was broader than what the mechanism delivers. That wording is
now fixed in the code comment.

---

## Why it's deferred (not built now)

1. **Requires a per-install asymmetric keypair with the private key in the OS
   keychain.** That is Tauri-only; browser dev (`npm run dev`) has no keychain,
   so it needs a defined fallback. New Rust commands + key lifecycle.
2. **The independent security review will likely specify the scheme** (algorithm,
   key storage, rotation, revocation), same reasoning as the deferred KDF change
   (H2). Building it now risks rework.
3. **It is a MEDIUM finding that does not break a stated product claim** once the
   overstated comment is corrected. The tamper-evidence property (the thing
   backups actually need for safe restore) already works.

Deferring is a judgment call, recorded here and in `SECURITY-AUDIT.md`.

---

## Design (when implemented)

Add a **device signature** ALONGSIDE the existing passphrase HMAC — do not
replace it. The HMAC still gives passphrase-bound tamper-evidence; the device
signature adds origin authenticity.

### Keypair
- Generate a per-install signing keypair at onboarding: **Ed25519** (preferred;
  small, fast, deterministic) or **ECDSA P-256** if Ed25519 support is awkward in
  the stack.
- **Private key**: stored in the OS keychain via Tauri `keyring` (same mechanism
  as the salts), never exported to the WebView JS heap. Signing happens in Rust.
- **Public key**: non-secret; may live in the keychain and also travels *inside*
  the signed backup payload so a verifier can check origin without prior
  knowledge (trust-on-first-restore, or pinned per known device).

### Backup format (v3)
```
{
  version: 3,
  createdAt, salts, records,       // as today
  devicePubKey: <base64 Ed25519 pub>,
  hmac:    <passphrase HMAC over canonical(v3 payload incl. devicePubKey)>,
  deviceSig: <Ed25519 sig over the SAME canonical bytes>
}
```
- `devicePubKey` is inside the HMAC-covered canonical form, so it cannot be
  swapped without failing the passphrase HMAC.
- Reuse the L3 `canonicalize()` / `signedView()` machinery; extend `signedView`
  to include `devicePubKey`.

### Verify-on-restore
1. Verify the passphrase HMAC (existing, required).
2. Verify `deviceSig` against `devicePubKey` (new).
3. **Trust policy for the pubkey** — decide one:
   - **Same-device restore:** compare `devicePubKey` to the local device's public
     key; mismatch = "backup from a different device" warning (not necessarily a
     hard fail).
   - **Cross-device restore (portable):** accept any well-formed self-consistent
     signature but surface the device identity to the operator (TOFU). A backup
     is then provably self-consistent and attributable to *a* device key, even if
     not this one.

### Fallback (no keychain / browser dev)
- If no device keypair is available (browser dev), fall back to today's
  HMAC-only backup with `version: 2` and a logged notice that device-origin
  authenticity is unavailable. Do not silently pretend to sign.

---

## Testability
- Keygen, sign, verify, canonical coverage of `devicePubKey`, and the
  tamper/forge cases are unit-testable with a software Ed25519 (e.g. WebCrypto
  Ed25519 where available, or a WASM lib) standing in for the keychain-held key.
- The **keychain storage** of the private key needs Tauri and manual QA (same as
  the salt keychain path, which is itself still runtime-unverified per the
  README).

---

## Open decisions for the maintainer
1. **Algorithm:** Ed25519 (preferred) vs ECDSA P-256?
2. **Trust policy:** same-device pin (stricter) vs cross-device TOFU (portable)?
   Backups are explicitly designed to be portable today, which argues for TOFU
   with a clear device-identity display.
3. **Fallback:** HMAC-only v2 in browser dev acceptable, or require the desktop
   build for any backup?
4. **Build now or after the independent audit?** (Recommended: after, with the
   overstated claim already corrected in code — done.)
