# Sanctuary

A local-first, encrypted health & legal records platform for the Injustice
Reform Network (IRN). Built for Navigators working with highly vulnerable
populations, where the core requirement is a **Technical Incapacity Defense**:
the operator should be unable to produce readable client PHI under subpoena,
because it is never stored in plaintext and the keys live only in RAM.

> **Status:** Working prototype. The architecture and core security features are
> implemented and unit-verified, but the app has **not** had an independent
> security review or full runtime QA. Do not enter real client PHI until it has.

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
| Encryption at rest | AES-256-GCM on every record |
| Key derivation | PBKDF2-SHA256, 600,000 iterations, per-install random salts |
| Key storage | Derived keys held in RAM only; never written to disk |
| Salt storage | OS keychain (via Tauri `keyring`); `localStorage` fallback in browser dev |
| Passphrase check | Encrypted verifier blob (wrong passphrase fails AES-GCM auth) |
| Backups | HMAC-signed, portable, verify-before-restore; ciphertext only |
| Dual vaults | Vault A (general) / Vault B (42 CFR Part 2, HRT, sensitive) |
| Panic close | "Close Vault B" wipes the Vault B key from memory instantly |
| Hardware switch | USB dead-man's switch (rusb) drops RAM keys on token removal |

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
```

The first run of **Audio Intake** downloads the Whisper model (~145 MB) once
from a public CDN, then runs entirely offline and cached.

## Known limitations

- Not runtime-QA'd end to end; several features (keychain round-trip, USB
  removal, IndexedDB persistence) are verified by build/unit tests but need a
  live desktop session to confirm.
- Evidence Vault stores whole files inside the encrypted DB — fine for photos
  and documents, but very large videos may be slow or hit storage limits.
- No automated test suite or third-party audit yet. Required before real PHI.

## License

See repository. Sanctuary is developed for the Injustice Reform Network
(501(c)(3), EIN 83-4207890).
