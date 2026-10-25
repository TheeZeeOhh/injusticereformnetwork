# Subpoena drill — cold seizure, 2026-10-17

**Question:** if a Sanctuary workstation is seized powered off, can an examiner
recover client PHI or the vault passphrases from what is on disk?

**Answer for the build drilled first (05:42):** no content and no passphrase
was recovered. One **metadata leak** was found: a Vault B record's client
reference is stored in plaintext, which reveals *which client has an HRT
record* without Vault B. The drill failed (exit 1).

**After the fix (same day, see [Fix and re-drill](#fix-and-re-drill)):**
nothing recovered, on a fresh install and on an upgraded one. The drill passes
(exit 0).

## What was run

`npm run drill:cold` (`scripts/subpoena-drill/cold-seizure.sh`), against the
release binary built 2026-10-17 05:42 from `sanctuary-app`.

1. The real binary runs in a sealed world: throwaway HOME, a private D-Bus
   session with its own gnome-keyring (encrypted with a login password, as on a
   real workstation), headless labwc. `env -i` drops the real session bus, so
   the operator's actual keychain is unreachable.
2. WebDriver (`tauri-driver` → `WebKitWebDriver`) drives the **native
   WebKitGTK webview** through onboarding, Vault A enrolment, a client record
   containing a random canary, Vault B enrolment with its own passphrase, and
   an HRT record containing a second canary and a random pseudonymous client
   ref (`PT-xxxxxxxxxx`, the format the form's placeholder suggests).
3. The app is killed with SIGKILL (power cut). `--graceful` sends SIGTERM first.
4. `forensics.mjs` byte-searches every file in the seized HOME and the runtime
   dir, plus the user journal and core dumps, for both canaries, both
   passphrases and the client ref — as UTF-8, UTF-16LE, hex and base64 at all
   three alignments.

### Why the result can be trusted

- **Positive control:** the operator name is stored in plaintext by design. The
  scan must find it (it did: WebKit `localstorage-wal`, UTF-16LE) or the run is
  marked invalid. This proves the scanner reads WebKit's storage.
- **Mutation check:** `--self-test` writes a canary in plaintext after the
  seizure; the scan caught it (exit 1).
- **Independent read:** the seized IndexedDB files were opened with `sqlite3`:
  `encryptedRecords` held 3 records (client directory, client, HRT) and
  `auditLog` 4 sealed entries. The data was persisted, and it was ciphertext.

## Results

| | power cut | graceful |
|---|---|---|
| Vault A canary (client record) | not recovered | not recovered |
| Vault B canary (HRT record) | not recovered | not recovered |
| Vault A passphrase | not recovered | not recovered |
| Vault B passphrase | not recovered | not recovered |
| Vault B client ref (metadata) | **recovered** | **recovered** |
| Core dumps, user journal | none / clean | none / clean |

### Finding 1 — HRT record keys disclose the client (severity: high)

`HrtTracking.jsx` saves to the record key `` `hrt_${clientRef}` `` and
IndexedDB stores record keys in plaintext. With the pseudonymous IDs the form
suggests — the same `PT-` IDs Vault A uses — anyone who compels **only the
Vault A passphrase** can decrypt the client directory and join it to the
`hrt_PT-…` keys, learning which clients are on HRT while Vault B stays closed.
That defeats the point of the Vault A / Vault B separation at the metadata
level.

The same ids reached the **audit log**: every Vault B read and write logged its
`recordId`, sealed under a key derived from passphrase A, so a passphrase-A
holder could read them there too. `consent_<clientRef>_<ts>` and
`bam_history_<clientId>` (42 CFR Part 2) had the same flaw.

## Fix and re-drill

- Vault B records are stored under `vb_` + HMAC-SHA256(id key, logical id),
  truncated to 128 bits. The id key is its own non-extractable key from
  passphrase B (PBKDF2 over saltB + a context label), bound to the Vault B key in
  RAM and dropped with it. The prefix is the same for every Vault B kind, so the
  disk doesn't show *which* kind exists either. Page code is unchanged: the
  storage engine does the mapping, and the AAD still binds the logical id.
- The audit log records the opaque id for Vault B.
- On Vault B unlock, legacy records move to their opaque ids (write, read back,
  then delete; a crash leaves duplicates, never loss). Past audit entries are
  re-sealed with opaque ids, the chain is rebuilt, and a sealed marker records
  the old chain head. The rewrite refuses to run on an already-broken chain.
- **Deleting a row does not erase it.** The first upgrade re-drill still
  recovered the ref: the live table was clean, but SQLite had kept the deleted
  cell in its page and the old page in the WAL. Both databases are therefore
  rebuilt after a migration: the live rows are copied to a staging database
  atomically, the original is deleted (its files unlinked), and the rows are
  written back. An interrupted rebuild is finished from staging on the next open.

| run | result |
|---|---|
| fresh install, fixed binary | RECOVERED 0, exit 0 |
| `--upgrade-from` pre-fix binary: before upgrade | client ref recovered (the required positive control) |
| `--upgrade-from` pre-fix binary: after upgrade, migration without rebuild | client ref recovered from SQLite residue, exit 1 |
| `--upgrade-from` pre-fix binary: after upgrade, with rebuild | RECOVERED 0, exit 0; HRT record still reads back by its ref |
| `--self-test` | planted leak caught, exit 1 |

Independent read (sqlite3) after the upgrade run: the live record keys were
`client_PT-…`, `client_directory` and one `vb_…`. There were two IndexedDB
databases (no staging copy left behind), and all 11 audit rows were kept.

Unit tests: `src/utils/vaultBOpaqueIds.test.js` and `src/utils/dbRebuild.test.js`.
In mutation checks, disabling the id mapping fails 7 of 10 tests, and dropping a
row in the rebuild fails 8 of 17.

Run the upgrade drill yourself: keep a copy of a pre-fix release binary, then
`./scripts/subpoena-drill/cold-seizure.sh --upgrade-from <old-binary>`.

### Lesser observations (by design, noted for the record)

- Audit log entries carry **plaintext timestamps** next to sealed payloads, so
  activity times are visible.
- Record keys `client_directory` and `client_PT-<n>` reveal that a directory
  exists and how many clients there are, not who they are. The number of `vb_`
  keys shows how many Vault B records exist, not whose or of what kind.
- **Backups made before the fix** still carry readable Vault B ids. Make a
  fresh backup after the first Vault B unlock on the new build, and destroy the
  old ones.
- The operator name is plaintext in localStorage (Onboarding marks it "not
  sensitive"); it does identify the operator of a seized machine.

## Not covered yet

- **Raw-disk residue:** filesystem blocks freed by the rebuild, slack,
  **swap**. This drill scans files, not the block device; that needs the IRN OS
  image in qemu (and is what full-disk encryption is for).
- **Warm seizure** (locked screen, RAM) and the **duress wipe chain**.
- Real hardware (TPM, USB dead-man's switch).
