import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { saveSecureRecord, loadSecureRecord } from './storageEngine';
import { deriveVaultAKey, deriveHmacKey, signData } from './cryptoEngine';
import { createBackup, restoreBackup } from './backupEngine';

// Task #17 (finding L3): the backup signature must cover a deterministic,
// key-order-independent canonical form, and legacy backups must still verify.

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

const PASS = 'correct horse battery staple gymnasium';

// Reproduce the LEGACY (pre-L3) canonical form + signature to prove backward
// compatibility with backups made before the fix.
function legacyCanonical(obj) {
  return JSON.stringify({
    version: obj.version,
    createdAt: obj.createdAt,
    salts: obj.salts,
    records: obj.records
  });
}

describe('backup canonicalization (L3)', () => {
  let key;
  beforeEach(async () => {
    installLocalStorage();
    globalThis.indexedDB = new IDBFactory();
    key = await deriveVaultAKey(PASS);
  });

  it('round-trips create -> restore', async () => {
    await saveSecureRecord(key, 'client_directory', [{ id: 'a1' }], 'A');
    const backup = await createBackup(PASS);

    globalThis.indexedDB = new IDBFactory();
    const { restored } = await restoreBackup(PASS, backup);
    expect(restored).toBe(backup.records.length);
    expect(await loadSecureRecord(key, 'client_directory', 'A')).toEqual([{ id: 'a1' }]);
  });

  it('verifies regardless of top-level key ORDER (the L3 property)', async () => {
    await saveSecureRecord(key, 'vouchers', [{ id: 'V1' }], 'A');
    const backup = await createBackup(PASS);

    // Rebuild the object with keys in a DIFFERENT insertion order. Plain
    // JSON.stringify would change, breaking a naive signature; canonicalize()
    // must not care.
    const reordered = {
      hmac: backup.hmac,
      records: backup.records,
      salts: backup.salts,
      createdAt: backup.createdAt,
      version: backup.version
    };

    globalThis.indexedDB = new IDBFactory();
    const { restored } = await restoreBackup(PASS, reordered);
    expect(restored).toBe(backup.records.length);
  });

  it('rejects tampering with a covered field (records)', async () => {
    await saveSecureRecord(key, 'client_directory', [{ id: 'a1' }], 'A');
    const backup = await createBackup(PASS);
    backup.records.push({ id: 'injected', data: 'AAAA' });
    await expect(restoreBackup(PASS, backup)).rejects.toThrow(/verification FAILED/i);
  });

  it('rejects tampering with the createdAt header', async () => {
    await saveSecureRecord(key, 'client_directory', [{ id: 'a1' }], 'A');
    const backup = await createBackup(PASS);
    backup.createdAt = '1999-01-01T00:00:00.000Z';
    await expect(restoreBackup(PASS, backup)).rejects.toThrow(/verification FAILED/i);
  });

  it('rejects a wrong passphrase', async () => {
    await saveSecureRecord(key, 'client_directory', [{ id: 'a1' }], 'A');
    const backup = await createBackup(PASS);
    await expect(
      restoreBackup('wrong horse battery staple gymnasium', backup)
    ).rejects.toThrow(/verification FAILED/i);
  });

  it('still verifies a LEGACY (v1 insertion-order) backup signature', async () => {
    await saveSecureRecord(key, 'client_directory', [{ id: 'a1' }], 'A');
    // Build a backup the OLD way: sign legacyCanonical of a v1 payload.
    const fresh = await createBackup(PASS);
    const legacyPayload = {
      version: 1,
      createdAt: fresh.createdAt,
      salts: fresh.salts,
      records: fresh.records
    };
    const hmacKey = await deriveHmacKey(PASS);
    const legacyHmac = await signData(hmacKey, legacyCanonical(legacyPayload));
    const legacyBackup = { ...legacyPayload, hmac: legacyHmac };

    globalThis.indexedDB = new IDBFactory();
    const { restored } = await restoreBackup(PASS, legacyBackup);
    expect(restored).toBe(legacyBackup.records.length);
  });
});
