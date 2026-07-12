// backupEngine.js
//
// HMAC-signed, encrypted vault backups.
//
// A backup carries ONLY AES-GCM ciphertext (the same blobs already at rest in
// IndexedDB) — PHI is never serialized in plaintext. The whole record set is
// signed with an HMAC-SHA-256 key derived from the operator passphrase, so any
// tampering is detected BEFORE restore, and only a passphrase-holder can forge
// a valid signature. Restore refuses to write anything unless the signature
// verifies.
import { getAllRecords, putRawRecord } from './storageEngine';
import {
  deriveHmacKey,
  signData,
  verifyData,
  exportSaltStore,
  importSaltStore,
  saltAFromStoreJson
} from './cryptoEngine';

const BACKUP_VERSION = 1;

function bytesToB64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
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
  const canonical = JSON.stringify(payload);

  const hmacKey = await deriveHmacKey(passphrase);
  const hmac = await signData(hmacKey, canonical);

  return { ...payload, hmac };
}

/**
 * Triggers a browser download of the signed backup file.
 */
export async function downloadBackup(passphrase) {
  const backup = await createBackup(passphrase);
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sanctuary-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Verifies and restores a backup object. Returns { restored } on success.
 * Throws if the signature does not verify (tamper detected) — nothing is
 * written to storage in that case.
 */
export async function restoreBackup(passphrase, backup) {
  if (!backup || !backup.records || !backup.hmac) {
    throw new Error('Malformed backup file.');
  }

  // Recompute the canonical string exactly as createBackup produced it (same
  // key order).
  const canonical = JSON.stringify({
    version: backup.version,
    createdAt: backup.createdAt,
    salts: backup.salts,
    records: backup.records
  });

  // Verify against the backup's OWN salts, WITHOUT persisting them to this
  // device. A failed verification therefore never mutates local state — this
  // is what makes cross-device restore both portable and safe.
  const backupSaltA = backup.salts ? saltAFromStoreJson(backup.salts) : null;
  const hmacKey = await deriveHmacKey(passphrase, backupSaltA);
  const ok = await verifyData(hmacKey, canonical, backup.hmac);
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
