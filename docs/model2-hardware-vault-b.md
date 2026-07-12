# Model 2 — Hardware-Bound Vault B (Design)

**Status:** Design only. No code. This is the spec for a future hardening
milestone; it is **not** buildable on the current hardware layer without the new
subsystem described here.

**Companion to:** `SECURITY-AUDIT.md` (finding C1, and M4), `docs/remediation-C1-C2.md`.

**Precondition (not yet met):** Model 1 (independent Vault B passphrase) must be
**runtime-QA'd on a real desktop build** first. As of writing, Model 1 has unit/
integration tests but no live desktop verification, and the USB dead-man's switch
itself is unverified on hardware. Do not start Model 2 until both are confirmed
on a physical machine with a physical token.

---

## Goal

Add a **second, hardware-held factor** to Vault B so that opening it requires
*both* the independent Vault B passphrase (Model 1) *and* physical possession of a
provisioned security token. Under seizure, a powered-off/locked device with the
token absent yields Vault B ciphertext that is uncrackable even with the correct
passphrase, because a per-token secret is missing.

This is the "violent removal annihilates keys / hardware dead-man's switch"
narrative already surfaced in onboarding, made cryptographically real.

Secondary goal: hold Vault B key material in the **Rust layer with `zeroize`**,
giving deterministic key destruction (closes finding **M4**).

---

## Why the current hardware layer is INSUFFICIENT

`src-tauri/src/lib.rs` today does **USB enumeration only**: `usb_present(vid, pid)`
checks whether a device advertising a given `vid:pid` is on the bus, and
explicitly never opens or reads the device. Two hard limits:

1. **No secret material.** Enumeration yields no key, challenge-response, or
   attestation — only "a device with this vid:pid is plugged in."
2. **`vid:pid` presence is trivially spoofable.** Any device (or an emulated one)
   can advertise the same vid:pid. Binding Vault B to "a matching device is
   present" provides **no cryptographic security** — an attacker plugs in any
   matching token, or emulates it in software.

**Conclusion:** binding Vault B to the existing presence check would be *security
theater*. Real Model 2 requires a token that performs a cryptographic operation
with a secret the attacker cannot extract. That is a new subsystem, not a wiring
change.

---

## Threat model (what Model 2 defends, and what it does not)

Defends:
- **Device seizure while token absent.** Attacker has the disk image, the OS
  keychain salts, and can brute-force the passphrase offline — but cannot derive
  the Vault B key without the token's per-token secret. Vault B stays sealed.
- **Coerced passphrase without the token.** Even given passphrase B, no token =
  no Vault B.

Does NOT defend:
- **Attacker has both the unlocked token and the passphrase.** (Same as any
  two-factor scheme.)
- **Malware on a running, unlocked session with Vault B open.** Once Vault B is
  open in RAM, endpoint compromise wins. Model 2 protects the *at-rest* and
  *token-absent* states, not a live compromised host.
- **A token that exports its secret.** The whole scheme rests on the token
  keeping its secret non-extractable (see token requirements).

---

## Token options (pick ONE target before implementing)

The implementation differs substantially by token type. This decision gates
everything else.

### Option T1 — FIDO2 / WebAuthn `hmac-secret` extension (RECOMMENDED)
- Modern security keys (YubiKey 5, SoloKeys, etc.) support the CTAP2
  `hmac-secret` extension: given a credential + a salt, the key returns a
  deterministic HMAC computed inside the token from a secret that **never
  leaves** the device.
- **Pro:** standardized, non-extractable secret, PIN/touch-gated, broad hardware
  support, and reachable from the WebAuthn API in some contexts or via a CTAP2
  library in Rust.
- **Con:** provisioning UX (credential creation), requires user presence
  (touch) on every unlock, browser/WebView WebAuthn support for `hmac-secret` is
  uneven — likely needs a native CTAP2 path in Rust.

### Option T2 — YubiKey HMAC-SHA1 challenge-response (OTP slot)
- YubiKeys can be programmed with an HMAC-SHA1 secret in an OTP slot; the host
  sends a challenge, the key returns HMAC-SHA1(secret, challenge).
- **Pro:** simple, deterministic, well-documented (`yubico`/`yubikey` crates),
  no per-use touch required (configurable).
- **Con:** YubiKey-specific (not generic), HMAC-SHA1 is dated (acceptable as a
  KDF input, not as a primitive we rely on for confidentiality), slot
  provisioning needed.

### Option T3 — Generic USB "presence" (REJECTED)
- Current vid:pid enumeration. **Rejected** — see "Why the current hardware layer
  is insufficient." Do not ship this as if it were hardware binding.

**Recommendation:** T1 (FIDO2 `hmac-secret`) for security and longevity; fall
back to T2 (YubiKey CR) if FIDO2 `hmac-secret` proves impractical from the
Tauri/WebView stack. Reject T3.

---

## Key-combination design

Let:
- `Kpass = PBKDF2/Argon2(passphraseB, saltB)` — the Model 1 Vault B key material.
- `Ktok  = tokenResponse(salt_tok)` — deterministic secret from the token
  (T1 `hmac-secret` output, or T2 HMAC-SHA1 response), non-extractable at rest.

Combine via **HKDF** (extract-then-expand), NOT XOR:

```
VaultBKey_v2 = HKDF-SHA256(
    ikm  = Kpass || Ktok,
    salt = saltB,
    info = "sanctuary-vaultB-hw-v1"
)
```

- HKDF binds both factors: missing *either* input yields a different key that
  fails the Vault B verifier and every record's GCM tag.
- `info` domain-separates from any other use.
- The token response depends on a stored `salt_tok` (non-secret), so the same
  token+passphrase always reproduce the same key, while a different token cannot.

Store (non-secret): `salt_tok`, the FIDO2 credential id (T1) or slot id (T2),
alongside the existing salts in the OS keychain.

---

## Rust key custody + zeroize (closes M4)

Move Vault B key material OUT of the WebView JS heap into Rust:

- New Tauri commands: `vaultb_open(passphraseB)` performs the token
  challenge-response, runs HKDF, verifies the Vault B verifier, and stores the
  derived `VaultBKey` **inside Rust** (never returned to JS).
- Vault B encrypt/decrypt become IPC: `vaultb_encrypt(recordId, plaintext)` /
  `vaultb_decrypt(recordId, ciphertext)` — the AAD (`sanctuaryv2|B|recordId`,
  matching C2) is constructed Rust-side.
- The key is wrapped in a `Zeroizing<...>` / `zeroize`-on-drop container.
- `vaultb_close()` (panic-close) and the `usb-disconnect-kill-signal` handler
  both drop + zeroize the key deterministically — unlike the current JS
  dereference, which only makes the CryptoKey GC-eligible (finding M4).

**Cost:** every Vault B record operation crosses the JS↔Rust boundary. Acceptable
for the low-volume, high-sensitivity Vault B classes (consent, HRT), but it means
Vault B logic diverges from Vault A (which stays WebCrypto-in-JS). Document this
asymmetry.

**Constraint:** this path only exists in the Tauri desktop build. In browser dev
(`npm run dev`) there is no token and no Rust — Vault B must fall back to Model 1
(passphrase-only) with a clear, logged notice, OR be disabled in dev. Decide
which (recommend: Model 1 fallback in dev, hardware required in production).

---

## Wiring the dead-man's switch to key annihilation

Today `usb-disconnect-kill-signal` triggers a full `logout()` in `App.jsx`. Under
Model 2:
- Token removal must **zeroize the Rust-held VaultBKey immediately** (the
  hardware factor is now physically gone, so Vault B must close).
- Whether it also logs out Vault A is a policy choice — recommend closing Vault B
  only (drop `VaultBKey`) and leaving Vault A open, since Vault A never depended
  on the token. (Current behavior logs out entirely; revisit.)
- The poll loop already exists (`lib.rs`); extend its handler rather than adding a
  second watcher.

---

## Migration (Model 1 → Model 2)

Existing Vault B records are v2/AAD encrypted under the Model 1 key
(`Kpass` only). Enabling Model 2 changes the key to include `Ktok`, so a
**re-key is required**, mirroring the Model 1 upgrade:

1. Provision the token (create FIDO2 credential / program YubiKey slot), store
   `salt_tok` + credential/slot id.
2. Open Vault B under Model 1 (passphrase B) to decrypt existing records.
3. Derive `VaultBKey_v2` (HKDF of `Kpass || Ktok`), enroll a new Vault B verifier
   under it.
4. Re-encrypt all Vault B records under `VaultBKey_v2` (Rust-side, v2/AAD).
5. Transactional in spirit: decrypt-all → provision+enroll → re-encrypt-all.

This should be an explicit "Enable hardware protection for Vault B" screen, same
posture as the Model 1 upgrade screen.

---

## Recovery policy (DECISION REQUIRED before implementation)

Model 1 chose "Vault B unrecoverable if passphrase forgotten (no escrow)." Model 2
adds a **second** loss vector: **a lost, broken, or reset token means Vault B is
permanently lost even if the passphrase is remembered.** This is strictly harsher
and must be an explicit, acknowledged decision. Options:

- **R1 — No recovery (consistent with Model 1).** Lost token = Vault B gone.
  Mitigation: require the operator to provision **two tokens** (primary + backup)
  at enable time, both enrolled independently. Strong, but operationally
  demanding.
- **R2 — Passphrase-only fallback recovery blob.** Store a copy of `VaultBKey_v2`
  wrapped under the Model 1 passphrase-only key. **This defeats the hardware
  factor** for anyone who has the passphrase, i.e. it silently downgrades to
  Model 1 — reject unless the token is purely a convenience factor.
- **R3 — Printed recovery code.** At enable time, emit a one-time high-entropy
  recovery secret combined into the HKDF as an alternate `Ktok`. The operator
  stores it offline (safe/paper). Balances recoverability against the "no digital
  escrow" principle.

**Recommendation:** **R1 with mandatory dual-token enrollment**, or **R3** if a
paper recovery code is operationally acceptable. Reject **R2** (it negates the
milestone). Confirm before building.

---

## Testability & what CANNOT be unit-tested

- The HKDF combination, verifier, and re-key logic **can** be unit-tested with a
  simulated `Ktok` (a fixed byte string standing in for the token response).
- The **actual token round-trip cannot be unit-tested** — it requires physical
  hardware and manual QA. Plan for a documented manual test protocol (insert
  token, open Vault B, remove token → Vault B zeroizes, re-insert → re-open).
- CI can cover everything except the token I/O; the token I/O needs a hardware
  test bench.

---

## Sequencing

| Step | Work | Blocked on |
|------|------|-----------|
| 0 | Runtime-QA Model 1 + USB switch on real hardware | (prerequisite) |
| 1 | Choose token target (T1/T2) + recovery policy (R1/R3) | maintainer |
| 2 | Rust key custody + zeroize for Vault B (M4), token-less | step 0 |
| 3 | Token challenge-response integration (T1 or T2) | steps 1,2 + hardware |
| 4 | HKDF key combination + Vault B verifier under new key | step 3 |
| 5 | "Enable hardware protection" re-key screen + migration | step 4 |
| 6 | Dead-man's switch → zeroize wiring | step 4 |
| 7 | Manual hardware QA protocol | all |

Note: **step 2 (Rust zeroize custody) is valuable on its own** — it closes M4 and
can ship independently of the token work if you want the deterministic-wipe win
before committing to hardware.

---

## Open decisions for the maintainer
1. **Token target:** T1 (FIDO2 `hmac-secret`) vs T2 (YubiKey HMAC-SHA1 CR)?
   (Reject T3 vid:pid presence.)
2. **Recovery policy:** R1 (no recovery; mandatory dual-token) vs R3 (printed
   recovery code)? (Reject R2.)
3. **Dev fallback:** Vault B falls back to Model 1 in browser dev, or is disabled
   outside the Tauri build?
4. **Ship step 2 (Rust zeroize / M4) independently** of the token work?
