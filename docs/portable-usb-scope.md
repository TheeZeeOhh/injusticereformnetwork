# Scope: Fully Portable USB Build ("Sanctuary-to-Go")

**Status:** Design scope. No code written. This touches the crypto/storage engine
and salt custody, so it needs Aziza's explicit sign-off before implementation
(per CLAUDE.md non-negotiables). Facts below are tagged VERIFIED (read from source)
where they gate the design.

## Goal

A caseworker plugs a USB stick into *any* compatible machine (field laptop,
library terminal), unlocks with a passphrase, works on real client records, then
pulls the stick — **nothing readable is left behind on the host, and the same
records are available on the next machine.** This is the "live off a stick"
scenario, distinct from (a) just running the binary from USB or (b) using USB as
the dead-man token (both already possible).

## What already exists (VERIFIED — the good news)

The portable-data problem is ~70% solved by the existing backup format:

- **`backupEngine.createBackup`** (VERIFIED, `src/utils/backupEngine.js:95-124`)
  produces a **self-contained, signed, portable bundle**: ciphertext records +
  the per-install salts + an HMAC signature. The code comment is explicit: salts
  are included *"so a different device can reinstall these salts and thereby
  derive the same keys/HMAC"* (`:104-108`). Records stay ciphertext; the whole
  payload is tamper-protected by the passphrase-derived HMAC.
- **`importSaltStore` / `saltAFromStoreJson`** (VERIFIED, `cryptoEngine.js:80-88`)
  already support installing a backup's salts on another device BEFORE deriving
  keys — including verifying against the backup's own salts without persisting.
- **Crypto is device-independent** (VERIFIED): keys derive from `passphrase +
  salt` (PBKDF2 600k, `cryptoEngine.js:217-238`). Nothing in key derivation is
  machine-bound EXCEPT where the salts live.

So the encryption model is *already portable*. The blockers are purely about
**where salts and records physically persist.**

## The two real blockers (VERIFIED)

1. **Salts live in the OS keychain, which is machine-bound.**
   `get_vault_salts` / `set_vault_salts` (VERIFIED, `src-tauri/src/lib.rs:127-150`)
   read/write the host's OS keychain (`keyring::Entry`). On a new machine the
   keychain is empty → `getOrCreateSalts` (`cryptoEngine.js:93-129`) would either
   fail or (worse) generate NEW salts and orphan the records. The keychain is the
   single machine-binding.

2. **Records live in host-profile IndexedDB.**
   `storageEngine.js` opens IndexedDB (`:11`), which the OS stores under the host
   user profile (`~/.local/share/…` / AppData), NOT on the USB. Data doesn't
   travel with the binary.

## Design options (with the security tradeoff called out)

The core decision is **where salt custody moves**, because that changes the
threat model. Three approaches, least-to-most invasive:

### Option A — Portable encrypted bundle on the USB (RECOMMENDED, smallest change)
Keep the engine as-is; treat the USB as the transport for the existing backup
bundle. Flow: on unlock, if a `sanctuary.backup` file exists on the USB, restore
it (salts + records) into RAM/IndexedDB; on lock/eject, re-export the bundle to
the USB and wipe local IndexedDB + keychain salts.
- **Reuses existing, tested code** (`createBackup` / `restoreBackup`).
- Salts ride *inside the passphrase-HMAC-signed bundle* — never in a host
  keychain. Custody moves from "OS keychain" to "encrypted signed file + operator
  passphrase," which is arguably MORE aligned with Technical Incapacity (no host
  artifact).
- **Tradeoff:** the keychain currently protects salts from webview-scoped code.
  On USB, that protection is replaced by: salts are non-secret anyway (documented
  `cryptoEngine.js:9-12`), records are useless without the passphrase, and the
  bundle is HMAC-signed. Net security is comparable; the *residual-on-host* risk
  goes DOWN.
- **Work:** a "USB session" mode (restore-on-unlock, export+wipe-on-eject), a
  file-picker/`fs` capability for the USB path, and a clean-wipe step. No crypto
  primitive changes.

### Option B — Redirect the whole data dir onto the USB
Point Tauri's app-data dir (and thus IndexedDB) + salt store at the USB mount, so
the app reads/writes the stick live.
- **More seamless** (no explicit export step) but **more fragile**: USB yank
  mid-write corrupts IndexedDB; IndexedDB isn't designed for removable media;
  cross-OS mount paths differ. Requires moving salts to a USB file anyway.
- Higher risk, higher effort. Not recommended as the first cut.

### Option C — Hardware-token-derived key (biggest change, best security)
The USB *is* a crypto token (e.g. a FIDO2/PIV key); a key component is unlocked
by the hardware. This is the strongest but is essentially the #1 re-architecture
track (Secure-Enclave-style custody) — out of scope here.

## Recommended plan (Option A), phased

1. **USB detection + session mode** — detect a `sanctuary.backup` on removable
   media; add a "work from USB" unlock path. (UI + a Tauri `fs`/dialog capability.)
2. **Restore-on-unlock** — reuse `restoreBackup`: install salts (`importSaltStore`)
   then load records into IndexedDB. Verify HMAC before touching anything (the
   restore path already does).
3. **Export-and-wipe-on-eject/lock** — re-`createBackup` to the USB, then wipe
   local IndexedDB (`deleteDatabase`, `storageEngine.js:132`) AND clear the
   keychain salts, so the host is left clean. Tie into the existing dead-man's
   switch (USB removal already wipes RAM keys — extend to trigger the data wipe).
4. **Atomicity** — write the new bundle to a temp file on the USB, fsync, rename;
   never wipe local data until the USB write is confirmed. (Prevents "yanked
   mid-save = data lost".)

## Invariant / security review (MUST resolve before build)

- **Salt custody change is the load-bearing decision.** Moving salts from OS
  keychain → signed USB bundle changes an invariant-adjacent control. It needs
  Aziza's explicit sign-off. The argument FOR: salts are non-secret, the bundle
  is passphrase-HMAC-signed, and it removes a host artifact (better subpoena
  posture). The argument to WATCH: a lost/stolen USB is now the whole vault in one
  object — but that's already true of any encrypted backup, and Vault B remains
  independently keyed.
- **Host-residue wipe must be verified**, not assumed — a "portable" build that
  leaves decrypted IndexedDB pages on the library PC defeats the entire purpose.
  This is a runtime-verification requirement (item 7 / ship gauntlet), not a
  unit-test claim.
- **Dead-man integration:** USB removal should wipe RAM keys (already does) AND
  ensure no plaintext hit disk. Confirm IndexedDB in this mode is
  memory-backed or wiped, not lazily flushed.

## Effort estimate (Option A)

- Reuses existing backup/restore + crypto (no primitive changes).
- New: USB session UI, `fs`/dialog capability + CSP/scope update, atomic
  export-and-wipe, dead-man wipe extension.
- Bulk of the risk is in the **wipe/atomicity + runtime residue verification**,
  not the crypto.

## Explicitly NOT in this scope

- No cloud/P2P sync (invariant intact — USB is sneakernet, not a network).
- No CRDT/multi-writer merge (single stick, single writer at a time).
- No Secure-Enclave/hardware-token key custody (that's the separate #1 track).
