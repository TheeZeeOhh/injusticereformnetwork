import { describe, it, expect, beforeEach } from 'vitest';
import {
  deriveVaultAKey,
  createOrVerifyPassphrase,
  duressEnrolled,
  isDuressPassphrase,
  enrollDuressPassphrase,
  clearDuressPassphrase
} from './cryptoEngine';

// Duress passphrase decision layer (crypto side). A duress passphrase unlocks
// nothing; it only needs to be recognizable at login so the wipe can fire.

const VAULT_PASS = 'correct horse battery staple gymnasium';
const DURESS_PASS = 'moonlit river ferry seventeen';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
  return store;
}

describe('duress passphrase (cryptoEngine)', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('reports not-enrolled and never matches before enrollment', async () => {
    expect(duressEnrolled()).toBe(false);
    expect(await isDuressPassphrase(DURESS_PASS)).toBe(false);
  });

  it('recognizes the enrolled duress passphrase and rejects others', async () => {
    await enrollDuressPassphrase(DURESS_PASS);
    expect(duressEnrolled()).toBe(true);
    expect(await isDuressPassphrase(DURESS_PASS)).toBe(true);
    expect(await isDuressPassphrase('some other phrase')).toBe(false);
  });

  it('clearing disarms recognition', async () => {
    await enrollDuressPassphrase(DURESS_PASS);
    clearDuressPassphrase();
    expect(duressEnrolled()).toBe(false);
    expect(await isDuressPassphrase(DURESS_PASS)).toBe(false);
  });

  it('refuses a duress passphrase that collides with the Vault A passphrase', async () => {
    // Enroll Vault A under VAULT_PASS.
    const keyA = await deriveVaultAKey(VAULT_PASS);
    await createOrVerifyPassphrase(keyA, 'A', { recordsExist: false });

    await expect(enrollDuressPassphrase(VAULT_PASS)).rejects.toThrow(/already unlocks a vault/i);
    // A distinct duress passphrase still enrolls fine.
    await enrollDuressPassphrase(DURESS_PASS);
    expect(await isDuressPassphrase(DURESS_PASS)).toBe(true);
  });

  it('the duress passphrase unlocks NOTHING (does not verify against Vault A)', async () => {
    const keyA = await deriveVaultAKey(VAULT_PASS);
    await createOrVerifyPassphrase(keyA, 'A', { recordsExist: false });
    await enrollDuressPassphrase(DURESS_PASS);

    // Deriving a Vault A key from the duress passphrase must fail the challenge.
    const duressAsVaultKey = await deriveVaultAKey(DURESS_PASS);
    expect(await createOrVerifyPassphrase(duressAsVaultKey, 'A', { recordsExist: true })).toBe(false);
  });
});
