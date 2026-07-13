import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { saveSecureRecord, loadSecureRecord } from '../utils/storageEngine';
import { deriveVaultAKey, deriveVaultBKey } from '../utils/cryptoEngine';

// Medication Management routing: general meds -> Vault A index ('med_index'),
// sensitive (HRT/MAT) meds -> Vault B index ('med_index_b'). Sensitive meds must
// NOT be readable with the Vault A key.
const INDEX_A = 'med_index';
const INDEX_B = 'med_index_b';
const PASS_A = 'correct horse battery staple gymnasium';
const PASS_B = 'a separate strong vault b passphrase';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

describe('Medication Management vault routing', () => {
  let aKey, bKey;
  beforeEach(async () => {
    installLocalStorage();
    globalThis.indexedDB = new IDBFactory();
    aKey = await deriveVaultAKey(PASS_A);
    bKey = await deriveVaultBKey(PASS_B);
  });

  it('stores a general medication in Vault A and reads it back', async () => {
    const meds = [{ id: 'MED-1', clientRef: 'C1', medication: 'Lisinopril', sensitive: false, status: 'Active' }];
    await saveSecureRecord(aKey, INDEX_A, meds, 'A');
    expect(await loadSecureRecord(aKey, INDEX_A, 'A')).toEqual(meds);
  });

  it('stores a sensitive (HRT) medication in Vault B, unreadable with Vault A key', async () => {
    const meds = [{ id: 'MED-2', clientRef: 'C1', medication: 'Estradiol', sensitive: true, status: 'Active' }];
    await saveSecureRecord(bKey, INDEX_B, meds, 'B');

    // Readable under Vault B.
    expect(await loadSecureRecord(bKey, INDEX_B, 'B')).toEqual(meds);
    // The Vault B index must NOT decrypt under the Vault A key.
    await expect(loadSecureRecord(aKey, INDEX_B, 'B')).rejects.toThrow();
    await expect(loadSecureRecord(aKey, INDEX_B, 'A')).rejects.toThrow();
  });

  it('keeps the two indexes independent (A and B do not collide)', async () => {
    await saveSecureRecord(aKey, INDEX_A, [{ id: 'a', medication: 'Metformin', sensitive: false }], 'A');
    await saveSecureRecord(bKey, INDEX_B, [{ id: 'b', medication: 'Testosterone', sensitive: true }], 'B');

    const a = await loadSecureRecord(aKey, INDEX_A, 'A');
    const b = await loadSecureRecord(bKey, INDEX_B, 'B');
    expect(a[0].medication).toBe('Metformin');
    expect(b[0].medication).toBe('Testosterone');
  });
});
