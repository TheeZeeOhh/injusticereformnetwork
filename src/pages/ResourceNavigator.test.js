import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { saveSecureRecord, loadSecureRecord, getAllRecords } from '../utils/storageEngine';
import { deriveVaultBKey, deriveVaultAKey } from '../utils/cryptoEngine';

// Resource Navigator: the directory is static, non-PHI. The per-client SAVED
// list is sensitive and must persist ENCRYPTED in Vault B ('B' tag).
const SAVED_ID = 'saved_resources';
const STRONG_B = 'a strong separate vault b passphrase';
const STRONG_A = 'correct horse battery staple gymnasium';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

describe('Resource Navigator saved list (Vault B)', () => {
  let bKey;
  beforeEach(async () => {
    installLocalStorage();
    globalThis.indexedDB = new IDBFactory();
    bKey = await deriveVaultBKey(STRONG_B);
  });

  it('persists and reloads a saved-resources list under Vault B', async () => {
    await saveSecureRecord(bKey, SAVED_ID, ['Chase Brexton Health Care', 'Trans Lifeline'], 'B');
    const out = await loadSecureRecord(bKey, SAVED_ID, 'B');
    expect(out).toEqual(['Chase Brexton Health Care', 'Trans Lifeline']);
  });

  it('stores the saved list as ciphertext (resource names not in plaintext)', async () => {
    await saveSecureRecord(bKey, SAVED_ID, ['GBMC Transgender Services'], 'B');
    const raw = await getAllRecords();
    const asText = new TextDecoder().decode(raw[0].data);
    expect(asText).not.toContain('GBMC');
  });

  it('is NOT readable with the Vault A key (belongs to Vault B)', async () => {
    await saveSecureRecord(bKey, SAVED_ID, ['Trans Lifeline'], 'B');
    const aKey = await deriveVaultAKey(STRONG_A);
    await expect(loadSecureRecord(aKey, SAVED_ID, 'A')).rejects.toThrow();
  });
});
