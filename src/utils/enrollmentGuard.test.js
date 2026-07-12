import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  deriveVaultAKey,
  createOrVerifyPassphrase
} from './cryptoEngine';
import { saveSecureRecord } from './storageEngine';
import { useAuthStore } from '../store/authStore';

// Task #18 (finding H1): guard trust-on-first-use enrollment against silently
// re-enrolling a new passphrase over orphaned records (lost/cleared verifier).

const SALT_KEY = 'sanctuary_vault_salts_v1';
const VERIFIER_A = 'sanctuary_vault_verifier_v1';
const STRONG = 'correct horse battery staple gymnasium';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    _store: store
  };
  return store;
}

function resetStore() {
  useAuthStore.setState({
    user: null, isAuthenticated: false, isOnboarded: false,
    isDecrypting: false, error: null,
    vaultAKey: null, vaultBKey: null, vaultBError: null
  });
}

describe('enrollment guard (H1) — unit', () => {
  beforeEach(() => {
    installLocalStorage();
    globalThis.indexedDB = new IDBFactory();
  });

  it('enrolls normally on a true first run (no verifier, no records)', async () => {
    const key = await deriveVaultAKey(STRONG);
    const ok = await createOrVerifyPassphrase(key, 'A', { recordsExist: false });
    expect(ok).toBe(true);
    expect(globalThis.localStorage.getItem(VERIFIER_A)).toBeTruthy();
  });

  it('REFUSES to enroll when records exist but no verifier (lost verifier)', async () => {
    const key = await deriveVaultAKey(STRONG);
    await expect(
      createOrVerifyPassphrase(key, 'A', { recordsExist: true })
    ).rejects.toThrow(/refusing to enroll/i);
    // No verifier was written — nothing silently changed.
    expect(globalThis.localStorage.getItem(VERIFIER_A)).toBeNull();
  });

  it('still challenges normally once a verifier exists (guard only affects enroll)', async () => {
    const key = await deriveVaultAKey(STRONG);
    await createOrVerifyPassphrase(key, 'A', { recordsExist: false }); // enroll
    // recordsExist true now must NOT matter, because a verifier exists.
    expect(await createOrVerifyPassphrase(key, 'A', { recordsExist: true })).toBe(true);
  });
});

describe('enrollment guard (H1) — authStore integration', () => {
  let store;
  beforeEach(async () => {
    store = installLocalStorage();
    globalThis.indexedDB = new IDBFactory();
    resetStore();
  });

  it('login refuses instead of orphaning records when the verifier was cleared', async () => {
    // Set up a real vault, store a record, then simulate a cleared verifier
    // (cache wipe / corruption) while the record and salts survive.
    await useAuthStore.getState().loginWithPassphrase('op', STRONG, 'Lead');
    const key = useAuthStore.getState().vaultAKey;
    await saveSecureRecord(key, 'client_directory', [{ id: 'c1', name: 'Ada' }], 'A');

    // Verifier gone, records + salts remain.
    store.delete(VERIFIER_A);
    expect(store.has(SALT_KEY)).toBe(true);
    resetStore();

    // A new login attempt must NOT silently re-enroll a fresh vault.
    await useAuthStore.getState().loginWithPassphrase('op', STRONG, 'Lead');
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(false);
    expect(s.error).toMatch(/refusing to enroll|orphan/i);
    // Verifier still absent (no silent enroll happened).
    expect(store.has(VERIFIER_A)).toBe(false);
  });
});
