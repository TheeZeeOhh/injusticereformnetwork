// backupEngine.js
//
// HMAC-signed, encrypted vault backups.
//
// A backup carries ONLY AES-GCM ciphertext (the same blobs already at rest in
// IndexedDB) — PHI is never serialized in plaintext. The whole record set is
// signed with an HMAC-SHA-256 key derived from the operator passphrase, so
// tampering is detected BEFORE restore, and restore refuses to write anything
// unless the signature verifies.
//
// AUTHENTICITY SCOPE (finding M3): because the HMAC key is derived from the
// passphrase, a valid signature proves only "produced by SOMEONE who holds the
// passphrase", NOT "produced by the origin device". Anyone with the passphrase
// can forge a valid backup. Device-origin authenticity (a per-install asymmetric
// signature) is DEFERRED — see docs/backup-authenticity-M3.md.
import { getAllRecords, putRawRecord } from './storageEngine';
import {
  deriveHmacKey,
  signData,
  verifyData,
  exportSaltStore,
  importSaltStore,
  saltAFromStoreJson
} from './cryptoEngine';
import { saveFile } from './fileTransfer';

const BACKUP_VERSION = 2;

// Deterministic canonicalization for the signed payload (finding L3).
//
// The signature must cover a representation that does NOT depend on JS object
// key insertion order. Plain JSON.stringify happens to be stable today only
// because keys are inserted in a fixed order; a refactor that reordered them, or
// added a field on one side, could silently break verification or leave a field
// outside the signed bytes. canonicalize() recursively sorts object keys, so the
// signed string is a function of the DATA, not of how the object was built.
function canonicalize(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return (
      '{' +
      keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}

// The exact fields the signature covers, in a fixed shape. Both create and
// verify build this from the same helper so they can never drift apart.
function signedView(obj) {
  return canonicalize({
    version: obj.version,
    createdAt: obj.createdAt,
    salts: obj.salts,
    records: obj.records
  });
}

// Legacy (v1) canonical form: the previous code signed JSON.stringify of the
// payload with keys in this exact insertion order. Retained so backups created
// before the L3 fix still verify.
function legacyCanonical(obj) {
  return JSON.stringify({
    version: obj.version,
    createdAt: obj.createdAt,
    salts: obj.salts,
    records: obj.records
  });
}

// Chunked base64 encode — avoids the RangeError that spreading a large array
// into String.fromCharCode causes (finding L1). Backups serialize every record's
// ciphertext, so this path must handle large buffers.
function bytesToB64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < arr.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, arr.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/**
 * Builds a signed backup object. `passphrase` is used only to derive the HMAC
 * signing key; it is not stored in the file.
 */
export async function createBackup(passphrase) {
  const raw = await getAllRecords();

  // Serialize ciphertext records to base64 so they survive JSON transport.
  const records = raw.map((r) => ({
    id: r.id,
    data: bytesToB64(r.data)
  }));

  // Include the (non-secret) per-install salts so the backup is portable: a
  // different device can reinstall these salts and thereby derive the same
  // keys/HMAC. The salts are inside the signed payload, so they are themselves
  // tamper-protected.
  const salts = await exportSaltStore();

  // Canonical string that the signature covers. Any change to records, salts,
  // or the header below invalidates the HMAC.
  const payload = {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    salts,
    records
  };
  // Sign the deterministic, order-independent canonical form (finding L3).
  const canonical = signedView(payload);

  const hmacKey = await deriveHmacKey(passphrase);
  const hmac = await signData(hmacKey, canonical);

  return { ...payload, hmac };
}

/**
 * Saves the signed backup file to a location the operator chooses.
 *
 * Was a `<a download>` click, which is a silent no-op in the Tauri webview
 * (finding B1) — the backup button appeared to work and produced no file.
 * Returns { saved } so the caller can distinguish "cancelled" from "done"
 * instead of claiming success either way.
 */
export async function downloadBackup(passphrase) {
  const backup = await createBackup(passphrase);
  const name = `sanctuary-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return saveFile(name, JSON.stringify(backup, null, 2), {
    mime: 'application/json',
    filters: [{ name: 'Sanctuary backup', extensions: ['json'] }],
  });
}

/**
 * Verifies and restores a backup object. Returns { restored } on success.
 * Throws if the signature does not verify (tamper detected) — nothing is
 * written to storage in that case.
 */
// Non-destructive verification: is this bundle restorable with this passphrase?
// Runs the SAME HMAC check restoreBackup does (against the bundle's own salts),
// but writes NOTHING to storage. Used by the portable-USB eject to prove the
// just-written USB bundle actually restores BEFORE the host is wiped — so a
// truncated/corrupt/wrong-passphrase bundle can never lead to a destructive wipe.
// Returns true if the signature verifies, false otherwise (never throws for a
// bad signature; only for a malformed object).
export async function verifyBackup(passphrase, backup) {
  if (!backup || !backup.records || !backup.hmac) {
    throw new Error('Malformed backup file.');
  }
  const backupSaltA = backup.salts ? saltAFromStoreJson(backup.salts) : null;
  const hmacKey = await deriveHmacKey(passphrase, backupSaltA);
  const okV2 = await verifyData(hmacKey, signedView(backup), backup.hmac);
  return okV2 || (await verifyData(hmacKey, legacyCanonical(backup), backup.hmac));
}

export async function restoreBackup(passphrase, backup) {
  if (!backup || !backup.records || !backup.hmac) {
    throw new Error('Malformed backup file.');
  }

  // Verify against the backup's OWN salts, WITHOUT persisting them to this
  // device. A failed verification therefore never mutates local state — this
  // is what makes cross-device restore both portable and safe.
  const ok = await verifyBackup(passphrase, backup);
  if (!ok) {
    throw new Error(
      'Backup signature verification FAILED. The file was tampered with or the passphrase is wrong. Restore aborted.'
    );
  }

  // Signature valid — NOW it is safe to install the backup's salts (so future
  // logins on this device derive the matching keys), then reinstate records.
  if (backup.salts) await importSaltStore(backup.salts);

  let restored = 0;
  for (const rec of backup.records) {
    await putRawRecord({ id: rec.id, data: b64ToBytes(rec.data) });
    restored += 1;
  }
  return { restored };
}
