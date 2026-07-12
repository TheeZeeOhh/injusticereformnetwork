import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { saveSecureRecord, loadSecureRecord } from './storageEngine';
import { deriveVaultAKey } from './cryptoEngine';
import { createBackup, restoreBackup } from './backupEngine';

// Task #14 (finding L1): base64 helpers must handle large buffers. The previous
// String.fromCharCode(...bytes) spread threw RangeError past the engine's
// argument limit. Backups base64 every record's ciphertext, so we round-trip a
// record far larger than that limit through a full backup/restore.

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

const STRONG_PASS = 'correct horse battery staple gymnasium';

describe('base64 large-buffer handling (L1)', () => {
  let key;
  beforeEach(async () => {
    installLocalStorage();
    globalThis.indexedDB = new IDBFactory();
    key = await deriveVaultAKey(STRONG_PASS);
  });

  it('backs up and restores a record whose ciphertext exceeds the spread limit', async () => {
    // ~512KB payload -> ciphertext well beyond the ~64-128k arg-spread ceiling.
    const big = 'x'.repeat(512 * 1024);
    await saveSecureRecord(key, 'evidence_blob_big', { b64: big }, 'A');

    // createBackup base64-encodes every record's ciphertext (the L1 hot path).
    const backup = await createBackup(STRONG_PASS);
    expect(backup.records.length).toBeGreaterThan(0);

    // Wipe and restore from the backup.
    globalThis.indexedDB = new IDBFactory();
    const { restored } = await restoreBackup(STRONG_PASS, backup);
    expect(restored).toBe(backup.records.length);

    const out = await loadSecureRecord(key, 'evidence_blob_big', 'A');
    expect(out.b64).toHaveLength(big.length);
    expect(out.b64).toBe(big);
  });
});
