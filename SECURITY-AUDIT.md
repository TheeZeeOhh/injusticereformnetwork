# Sanctuary — Cryptography Security Audit

**Scope:** Client-side cryptographic design and its use across the application.
**Method:** Static source review (adversarial). No runtime testing, no dynamic
analysis, no third-party tooling.
**Status:** Internal review only. This is **not** an independent security audit
and does not substitute for one. Do not enter real client PHI until an
independent review and the CRITICAL findings below are resolved.

**Reviewed files:**
- `src/utils/cryptoEngine.js` — key derivation, AES-GCM, HMAC, verifier
- `src/utils/storageEngine.js` — encrypted IndexedDB persistence
- `src/utils/backupEngine.js` — signed portable backups
- `src/store/authStore.js` — RAM key lifecycle, panic wipe
- `src-tauri/src/lib.rs` — OS keychain, USB dead-man's switch
- `src/pages/*.jsx` — per-module use of vault keys

---

## What is correctly implemented

These held up under review and should be preserved:

- **AES-256-GCM** on every record via WebCrypto (`crypto.subtle`); random 96-bit
  IV per encryption, IV prepended to ciphertext (`cryptoEngine.js` `encryptRecord`).
- **PBKDF2-SHA256** key derivation with non-extractable `CryptoKey` outputs; raw
  key bytes never enter the JS heap.
- **Keys held in RAM only** (Zustand store); never serialized to disk or
  localStorage.
- **Passphrase verification before record access** via an encrypted verifier
  blob whose AES-GCM auth tag fails on a wrong passphrase.
- **Salts stored in the OS keychain** (Tauri `keyring`), out of webview reach;
  correctly treated as non-secret.
- **Backups carry ciphertext only**, HMAC-SHA-256 signed, verify-before-restore,
  and a failed verification does not mutate local state.

"Correct primitives" is a necessary but not sufficient condition. The findings
below concern how those primitives are composed into a system.

---

## Severity summary

| ID | Severity | Finding | Breaks a stated claim? |
|----|----------|---------|------------------------|
| C1 | CRITICAL | Both vaults derive from one passphrase — no real separation | Yes: "dual vaults" |
| C2 | CRITICAL | No AAD; encrypted records are swappable between IDs | Yes: chain-of-custody integrity |
| H1 | HIGH | Trust-on-first-use enrollment enables silent takeover/lockout | Partially |
| H2 | HIGH | KDF below current guidance; PBKDF2 is GPU-cheap | Yes: seizure resistance |
| H3 | HIGH | 8-char passphrase floor, no strength check | Yes: "technical incapacity" |
| M1 | MEDIUM | Vault B key never validated at login | No |
| M2 | MEDIUM | GCM IV-collision risk at very high record counts | No (scale-dependent) |
| M3 | MEDIUM | Backup HMAC keyed by same passphrase — no insider authenticity | Partially |
| M4 | MEDIUM | Panic/logout dereferences keys; no deterministic zeroization | Partially: "instantly" |
| L1 | LOW | `btoa(String.fromCharCode(...bytes))` can throw on large blobs | No (correctness) |
| L2 | LOW | Corrupt-salt fallback silently orphans all prior records | No (data loss) |
| L3 | LOW | `JSON.stringify` used as canonical form for HMAC | No (fragility) |

## Remediation status (updated 2026-07-12)

- **C2 — REMEDIATED.** Records now bind (vaultTag, recordId) as AES-GCM AAD via a
  versioned envelope; legacy records auto-upgrade on login. Substitution/
  relocation now fails authentication. Covered by tests.
- **C1 — REMEDIATED (Model 1).** Vault B is keyed on an INDEPENDENT passphrase;
  it stays closed after login and opens only via explicit unlock. Panic-close is
  now cryptographically meaningful, and a login-passphrase holder alone cannot
  read Vault B. Legacy installs upgrade via an explicit "upgrade your vault"
  re-key. Vault B is unrecoverable by design (no escrow). Model 2 (hardware
  binding) remains a later hardening milestone.
- **M1 — REMEDIATED** as part of C1 (Vault B now has its own verifier).
- **H1, H2, H3, M2, M3, M4, L1–L3 — OPEN.** Not yet addressed.

Note: these remediations are from an internal review with an automated test
suite. They do NOT substitute for the independent security review the README
gates real-PHI use on.

---

## CRITICAL

### C1 — Dual-vault separation is cosmetic (same passphrase)

**Location:** `cryptoEngine.js` `deriveVaultKeys`; `authStore.js` `panicWipeVaultB`.

`deriveVaultKeys()` derives **both** the Vault A and Vault B keys from the **same
passphrase**, differing only by salt. Salts are non-secret and stored together in
the same keychain entry.

Consequences:
- "Close Vault B" only drops the key reference from RAM. It provides no
  cryptographic protection: anyone holding the passphrase can instantly
  re-derive the Vault B key from the same passphrase plus the co-located salt.
- There is no scenario in which an adversary can open Vault A but not Vault B.
- The threat model the README attaches to Vault B (42 CFR Part 2, HRT continuity,
  Maryland Trans Shield Act — protecting the *most* sensitive class separately)
  is **not met**.

**Impact:** The headline "dual vault" security feature does not deliver
cryptographic separation.

**Direction:** Vault B must be gated by an **independent secret** (a second
passphrase, or a hardware-held key), so that Vault B ciphertext is
undecryptable while Vault B is closed even to a passphrase-A holder.

---

### C2 — No AAD: encrypted records are swappable between identities

**Location:** `cryptoEngine.js` `encryptRecord` / `decryptRecord`;
`storageEngine.js` `saveSecureRecord` / `putRawRecord`.

AES-GCM is used with no **Additional Authenticated Data**. The record's `id`
(e.g. `client_8942`, `evidence_blob_EV-...`) is not cryptographically bound to
its ciphertext. GCM authenticates the *bytes* but not *where they belong*.

An attacker with write access to IndexedDB (local malware, another local user,
forensic tooling) can copy one record's encrypted blob into a different record's
`id` slot; it decrypts cleanly under the same vault key. Records can be swapped,
duplicated, or rolled back within a vault without detection.

**Impact:** Storage-layer integrity is weaker than the "chain of custody" framing
implies. Evidence Vault's per-file SHA-256 detects tampering of a file's *bytes*,
but not relocation/substitution of whole encrypted records at the DB layer.

**Direction:** Bind each record's `id` (and ideally a vault tag and version) into
the AES-GCM operation as AAD, so a blob only authenticates under the id it was
sealed for.

---

## HIGH

### H1 — Trust-on-first-use enrollment: silent takeover / silent lockout

**Location:** `cryptoEngine.js` `createOrVerifyPassphrase`, `vaultExists`.

Whatever passphrase is entered first *becomes* the vault passphrase, with no
confirmation step. If the verifier blob in localStorage is ever cleared (cache
wipe, `nukeStorage`, corruption), the next passphrase entered silently enrolls a
**new** vault. Prior encrypted records become permanently undecryptable, with no
warning that a re-enrollment (not a login) just occurred. A local attacker can
also pre-enroll a passphrase they control before the legitimate user's first run.

**Direction:** Require passphrase confirmation at enrollment; make first-run
enrollment an explicit, distinct flow from login; warn loudly if a verifier is
absent when records already exist.

### H2 — KDF below current guidance; PBKDF2 is GPU-cheap

**Location:** `cryptoEngine.js` `CRYPTO_CONFIG.KDF_ITERATIONS = 600000`.

PBKDF2-SHA256 is highly parallelizable on GPUs/ASICs. For a passphrase-derived
key that is the sole barrier to all PHI under device seizure, this is the weakest
structural choice. Current OWASP guidance is ~1.3M PBKDF2-SHA256 iterations, and
memory-hard **Argon2id** (or scrypt) is strongly preferred precisely because it
resists the offline GPU cracking a subpoena- or seizure-motivated adversary uses.

**Impact:** A seized device's IndexedDB + keychain salts are crackable offline
for any low-entropy passphrase. Directly weakens the "technical incapacity
defense."

**Direction:** Move to Argon2id with tuned memory/time cost; if PBKDF2 must
remain, raise iterations to current guidance and treat it as interim.

### H3 — Passphrase strength floor undermines every layer above it

**Location:** `authStore.js` (`passphrase.length < 8`).

An 8-character minimum with no complexity or zxcvbn-style entropy check means a
user may choose a trivially guessable passphrase. Every crypto guarantee reduces
to the entropy of this passphrase; the KDF cost only matters if the passphrase
has entropy to protect.

**Direction:** Enforce a meaningful entropy floor (length + zxcvbn score), reject
common/breached passphrases, and surface a strength meter at enrollment.

---

## MEDIUM

### M1 — Vault B key not validated at login

**Location:** `authStore.js` `loginWithPassphrase`; verifier is Vault-A only.

Login validates the passphrase by decrypting the **Vault A** verifier. Vault B
key correctness is only discovered lazily when a module fails to decrypt,
surfacing as scattered "could not decrypt with the current Vault B key" errors
rather than a clean login-time signal.

**Direction:** Add a Vault B verifier blob and check both at login.

### M2 — GCM IV-collision risk at very high record counts

**Location:** `cryptoEngine.js` `encryptRecord` (random 96-bit IV).

Random 96-bit IVs are safe at low volume, but AES-GCM leaks catastrophically on
IV collision under one key; the birthday bound becomes relevant around ~2^32
encryptions per key. Not a concern at this application's expected scale, but
noted for durability.

**Direction:** If per-key encryption volume could ever grow large, adopt a
deterministic/counter-based nonce scheme.

### M3 — Backup HMAC provides no insider authenticity

**Location:** `cryptoEngine.js` `deriveHmacKey`; `backupEngine.js`.

The HMAC key is derived from the same passphrase (correctly domain-separated).
The signature therefore proves "produced by a passphrase-holder," not "produced
by the origin device." Any party who can decrypt can also forge a valid backup
signature. This matches the documented design but is authenticity theater against
an insider.

**Direction:** If device-origin authenticity is desired, sign with a
device-held asymmetric key in addition to the passphrase HMAC.

### M4 — Panic wipe / logout is dereference, not zeroization

**Location:** `authStore.js` `panicWipeVaultB`, `logout`.

These set the Zustand key reference to `null`. The `CryptoKey` is non-extractable
(good — raw bytes never in JS heap), but the key object's destruction is up to
engine GC, not deterministic. "Wiped instantly" overstates the guarantee: the key
material may persist in process memory until collection, a window exploitable by
live-RAM forensic capture.

**Direction:** Document the wipe as best-effort dereference; for stronger
guarantees, hold Vault B key material in the Rust layer with explicit zeroization
(e.g. `zeroize`) and expose only scoped operations to the webview.

---

## LOW / hygiene

- **L1 — Base64 of large buffers can throw.** `toBase64` uses
  `btoa(String.fromCharCode(...bytes))` (`cryptoEngine.js`), spreading the whole
  array as arguments; large blobs can exceed the JS argument limit. EvidenceVault
  chunks correctly; cryptoEngine does not. Correctness bug, not a security hole.
- **L2 — Corrupt-salt fallback silently regenerates salts**
  (`cryptoEngine.js` `getOrCreateSalts`), permanently orphaning all prior records
  with no user consent or warning. Data-loss footgun.
- **L3 — `JSON.stringify` as canonical form for the backup HMAC**
  (`backupEngine.js`). Works today because JS preserves insertion order, but
  relying on stringify for canonicalization is fragile; a future refactor could
  silently invalidate signatures or, worse, mask a covered field.

---

## Recommended remediation order

1. **C1** and **C2** — these break the two headline security claims (dual-vault
   separation, chain-of-custody integrity). Address before any other work.
2. **H2** and **H3** — strengthen the KDF and passphrase policy together; neither
   helps without the other.
3. **H1** — fix the enrollment/lockout footgun.
4. **M1–M4**, then **L1–L3**.
5. Only after the above: commission an **independent** security review and add an
   automated crypto test suite (round-trip, tamper-detection, wrong-passphrase
   rejection, cross-device restore, AAD-mismatch rejection) before real PHI.

---

*This document records findings from a static, adversarial source review. It is
not an independent audit and makes no warranty. Verify all findings against the
current source before acting on them.*
