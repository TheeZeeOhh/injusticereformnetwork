# CLAUDE.md

Guidance for AI agents working in this repo. For product/security narrative, read
[`README.md`](README.md) and [`SECURITY-AUDIT.md`](SECURITY-AUDIT.md) first.

## What this is

**Sanctuary** — a local-first, client-side-encrypted health & legal records app
for the Injustice Reform Network (IRN). React + Vite frontend packaged as a
desktop app via **Tauri v2** (Rust shell). Core design goal is a *Technical
Incapacity Defense*: the operator must be unable to produce readable client PHI
under subpoena (encrypted at rest, keys in RAM only).

## Commands

```bash
npm install            # install frontend deps
npm run dev            # Vite dev server → http://localhost:5173
npm test               # Vitest run (crypto, storage, vault separation, backups)
npm run lint           # oxlint
npm run build          # vite build
npm run tauri build    # desktop build (needs Rust toolchain + libusb-1.0, libsecret)

# operational backend (holds NO PHI), from ./server
cd server && npm install && npx prisma db push && node index.js

./start.sh             # boots backend + frontend and opens the browser
```

Run a single test file: `npx vitest run src/utils/cryptoEngine.aad.test.js`

**After cloning, enable the commit gate:** `git config core.hooksPath .githooks`
This runs `npm test` + `npm run lint` on every commit and blocks on failure
(`core.hooksPath` is local git config, not tracked, so a fresh clone needs it).
If the suite ever exceeds ~30s, scope pre-commit to lint + affected tests and
move the full suite to `.githooks/pre-push` — a slow gate gets `--no-verify`'d,
which is worse than no gate.

## Layout

- `src/pages/` — React feature modules (one file per module; `.test.js` beside it).
- `src/utils/` — engines: `cryptoEngine`, `storageEngine`, `backupEngine`,
  `auditLog`, `migrationEngine`, `hiveEngine`, `aminaEngine`, `guardrails`.
- `src/store/` — Zustand stores (`authStore`, `settingsStore`).
- `src/workers/whisperWorker.js` — on-device Whisper (WASM) for Audio Intake.
- `src-tauri/` — Rust shell (keychain, USB dead-man's switch). `src/lib.rs` is the core.
- `server/` — Express + Prisma (SQLite) intelligence daemons; bound to `127.0.0.1`; **no PHI**.

## Non-negotiable guardrails

These reflect the whole point of the project — do not weaken them without an
explicit, deliberate request from Aziza:

- **No PHI leaves the device.** No cloud sync, no P2P, no telemetry carrying
  client data. The `server/` backend handles operational/non-PHI data only.
- **Keys stay in RAM.** Never persist derived keys or plaintext passphrases to
  disk, logs, or state.
- **Never store client data unencrypted.** All records go through the crypto
  engine (AES-256-GCM, identity bound as AAD).
- **Vault A / Vault B separation is real, not cosmetic.** Independent passphrases;
  Vault B (42 CFR Part 2 / HRT / sensitive) stays closed until explicitly unlocked.
  Don't cache the Vault B passphrase or cross-key the vaults.
- **Vault B is unrecoverable by design** — no reset/escrow. Don't add one casually.
- Crypto/vault behavior is safety-critical: **changes here must keep the existing
  tests green**, and prefer adding tests over loosening them.

## Verification-first (always on)

Never trust a reported result you did not cause to run. This is the discipline
that catches the untested change *before* it lands.

- **A reported result is not a verified result.** "Tests should pass," "this
  looks right," "the function returns X" mean nothing until code has actually
  executed and you've read the real output.
- **Suspiciously good = probably bugged.** If something passes instantly, matches
  perfectly, or is easier than expected, assume a bug (wrong file, silent skip,
  stubbed path) until proven otherwise.
- **Trace one real example end to end.** Don't reason about behavior in the
  abstract — pick a concrete input, follow it through the actual code path, and
  confirm the actual output.
- **Sanity-check independently.** Confirm the result a second way that doesn't
  share the first method's assumptions (different input, inverse operation, a
  count, a direct read of state).
- Invoke the `/verify` skill for the full step-by-step checklist when finishing
  non-trivial work.

## What "done" means — the ship gauntlet (always on)

"Done" is not "I wrote the code." The full chain is:
**test → lint → build → commit → push → runtime verification.** Do not truncate it.

- **A built binary is not a verified binary.** Compiling/bundling proves it
  builds, not that it *runs* correctly. Runtime confirmation on the real target
  (e.g. the labwc kiosk, the CSP gauntlet) is a distinct, required step.
- Commit/push is gated by Aziza's explicit go-ahead (never auto-commit) and by
  the `.githooks/pre-commit` test+lint gate.
- Do not declare shipping complete while runtime verification is pending — say
  what's still unconfirmed and name the outstanding step. Invoke `/ship` to run
  the gauntlet; it refuses to call work shipped without runtime confirmation.

## Privacy aggregation (always on)

Any number derived from client/casework data that leaves an aggregate — dashboard
tile, rollup, chart, grant statistic, export — must pass the k-anonymity gate. A
count of 1 for "trans clients, 757, this week" *is* that person's record.

- **Minimum cell size n ≥ 5**; smaller cells are **suppressed** (not rounded).
- **Quasi-identifiers count toward the threshold** — the rule applies to the
  *combination* (jurisdiction + demographic + timeframe + cross-tabs), not just an
  explicit identity column.
- **Uncertainty → silence.** If you can't confirm a cell is ≥5, emit nothing.
- **Use the shared gate, don't reinvent it:** route aggregates through
  `suppressSmallCells` / `cellEmittable` in `src/utils/guardrails.js`
  (`MIN_CELL_SIZE = 5`, tested). New rollup/report tooling must not fork the
  threshold. Changing `MIN_CELL_SIZE` needs test changes and Aziza's sign-off.
- Invoke `/privacy-agg` for the full checklist. This is distinct from (and looser
  than) the hive-mind admission gate — see the invariant memory; person-level data
  never enters the replicated store at all.

## Conventions

- ES modules (`"type": "module"`); React 19; React Router 7; Zustand for state.
- Tests: Vitest, node environment, `fake-indexeddb` for storage. Test files are
  `src/**/*.test.js`. Add tests next to the code they cover.
- Lint: oxlint with the react plugin; `rules-of-hooks` is an error.
- The status/README claims are load-bearing (grant + credibility narratives in
  `docs/`). If you change security behavior, keep those docs honest.
