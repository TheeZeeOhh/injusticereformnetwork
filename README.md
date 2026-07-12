# Sanctuary

A local-first, encrypted health & legal records platform for the Injustice
Reform Network (IRN). Built for Navigators working with highly vulnerable
populations, where the core requirement is a **Technical Incapacity Defense**:
the operator should be unable to produce readable client PHI under subpoena,
because it is never stored in plaintext and the keys live only in RAM.

> **Status:** Working prototype. The architecture and core security features are
> implemented and covered by an automated test suite (~83 tests). An internal
> adversarial crypto review has been done and its two CRITICAL findings fixed
> (see [`SECURITY-AUDIT.md`](SECURITY-AUDIT.md)), but the app has **not** had an
> **independent** security review or full runtime QA. Do not enter real client
> PHI until it has.

## Architecture

- **Frontend:** React + Vite, packaged as a desktop app via **Tauri v2** (Rust shell).
- **Storage:** All client data is encrypted client-side and stored locally in
  IndexedDB. There is **no cloud sync and no peer-to-peer network.**
- **Operational backend (`server/`):** A slimmed Express + Prisma (SQLite)
  service that holds **no PHI** — it runs only the "intelligence" daemons over
  non-PHI operational telemetry (e.g. the Ember Fund), bound to `127.0.0.1`.

### Security model

| Concern | Implementation |
| --- | --- |
| Encryption at rest | AES-256-GCM on every record, with the record's identity (vault + id) bound in as AAD so ciphertext cannot be relocated or swapped between records |
| Key derivation | PBKDF2-SHA256, 600,000 iterations, per-install random salts (raising this to Argon2id is a tracked, deferred hardening item — see the audit) |
| Key storage | Derived keys held in RAM only; never written to disk |
| Salt storage | OS keychain (via Tauri `keyring`); `localStorage` fallback in browser dev. A corrupt salt store refuses to silently regenerate (would orphan records) |
| Passphrase policy | zxcvbn-based strength gate (length ≥ 12, score ≥ 3) enforced at enrollment, with a live strength meter |
| Passphrase check | Encrypted verifier blob (wrong passphrase fails AES-GCM auth); enrollment refuses to silently re-create a vault over existing records |
| Backups | HMAC-signed over a deterministic canonical form, portable, verify-before-restore; ciphertext only. The signature proves tamper-evidence + passphrase-holding, **not** device origin (device-origin signing is a tracked, deferred item) |
| Dual vaults | Vault A (general) and Vault B (42 CFR Part 2, HRT, sensitive) are keyed on **independent passphrases**; Vault B stays closed after login and opens only via an explicit unlock |
| Panic close | "Close Vault B" drops the Vault B key from RAM; because the Vault B passphrase is never cached, re-opening requires re-entering it |
| Hardware switch | USB dead-man's switch (rusb) drops RAM keys on token removal. This is presence-detection only; true cryptographic hardware binding is designed but not yet built |

## Modules

Client records, HRT continuity (Vault B), 42 CFR consent management (Vault B),
medication management, scheduling, shift swaps, staffing pipeline,
transportation, vouchers, attorney directory, **FOIA generator** (real PDF
export), **Evidence Vault** (real SHA-256 chain-of-custody with verify/download),
**Visual Canvas** (encrypted note board), **Audio Intake** (on-device Whisper
transcription via WASM, zero-network after first-run model download), and an
in-app User Manual.

## Getting started

```bash
# install deps
npm install

# frontend dev server (http://localhost:5173)
npm run dev

# operational backend (no PHI) — from ./server
cd server && npm install && npx prisma db push && node index.js

# build the desktop app (requires Rust toolchain + libusb-1.0, libsecret)
npm run tauri build

# run the automated test suite (crypto, storage, vault separation, backups)
npm test
```

The first run of **Audio Intake** downloads the Whisper model (~145 MB) once
from a public CDN, then runs entirely offline and cached.

## Security status

An internal, adversarial review of the cryptography is recorded in
[`SECURITY-AUDIT.md`](SECURITY-AUDIT.md). Current state:

- **Fixed & tested:** both CRITICAL findings (real dual-vault separation; record
  identity binding), plus enrollment safety, passphrase-strength policy, Vault B
  verification, and three low-severity correctness/data-loss issues.
- **Deferred (with written designs):** stronger memory-hard KDF (Argon2id),
  device-origin backup signing, and hardware-bound Vault B — these are captured
  in `docs/` and are the kind of thing an independent review will re-parameterize
  anyway.
- **Still open:** minor items (GCM IV-collision at extreme scale, deterministic
  key zeroization) and a typed-twice passphrase confirmation.

An **independent** security review is still required before real PHI.

## Known limitations

- Not runtime-QA'd end to end; several features (keychain round-trip, USB
  removal, IndexedDB persistence) are covered by unit/integration tests but need
  a live desktop session to confirm.
- Evidence Vault stores whole files inside the encrypted DB — fine for photos
  and documents, but very large videos may be slow or hit storage limits.
- Vault B is **unrecoverable by design** — there is no passphrase reset or
  escrow. A forgotten Vault B passphrase means that data is permanently lost.

## License

See repository. Sanctuary is developed for the Injustice Reform Network
(501(c)(3), EIN 83-4207890).
