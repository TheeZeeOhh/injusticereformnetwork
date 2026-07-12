import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { useAuthStore } from './authStore';

// Task #9 — C1 Model 1 auth flow.
//
// Vault A opens at login; Vault B stays CLOSED until an explicit unlock with its
// own passphrase. Panic-close drops the Vault B key and re-opening requires
// re-entering passphrase B (never cached).

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

function resetStore() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isOnboarded: false,
    isDecrypting: false,
    error: null,
    vaultAKey: null,
    vaultBKey: null,
    vaultBError: null
  });
}

describe('authStore — C1 Model 1 vault lifecycle', () => {
  beforeEach(() => {
    installLocalStorage();
    globalThis.indexedDB = new IDBFactory();
    resetStore();
  });

  it('login opens Vault A but leaves Vault B CLOSED', async () => {
    await useAuthStore.getState().loginWithPassphrase('op', 'login-pass-A', 'Lead');
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(true);
    expect(s.vaultAKey).not.toBeNull();
    expect(s.vaultBKey).toBeNull(); // the core C1 behavior
  });

  it('rejects a short login passphrase', async () => {
    await useAuthStore.getState().loginWithPassphrase('op', 'short', 'Lead');
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(false);
    expect(s.error).toMatch(/too short/i);
  });

  it('unlockVaultB enrolls on first use then opens Vault B', async () => {
    await useAuthStore.getState().loginWithPassphrase('op', 'login-pass-A', 'Lead');
    const ok = await useAuthStore.getState().unlockVaultB('vault-b-pass');
    expect(ok).toBe(true);
    expect(useAuthStore.getState().vaultBKey).not.toBeNull();
  });

  it('a wrong Vault B passphrase on a second unlock keeps Vault B closed', async () => {
    await useAuthStore.getState().loginWithPassphrase('op', 'login-pass-A', 'Lead');
    await useAuthStore.getState().unlockVaultB('correct-b-pass'); // enroll
    useAuthStore.getState().panicWipeVaultB();

    const ok = await useAuthStore.getState().unlockVaultB('WRONG-b-pass');
    expect(ok).toBe(false);
    expect(useAuthStore.getState().vaultBKey).toBeNull();
    expect(useAuthStore.getState().vaultBError).toMatch(/incorrect/i);
  });

  it('the login passphrase does NOT open Vault B (independent secret)', async () => {
    await useAuthStore.getState().loginWithPassphrase('op', 'login-pass-A', 'Lead');
    await useAuthStore.getState().unlockVaultB('vault-b-pass'); // enroll B
    useAuthStore.getState().panicWipeVaultB();

    // Trying to open Vault B with the Vault A login passphrase must fail.
    const ok = await useAuthStore.getState().unlockVaultB('login-pass-A');
    expect(ok).toBe(false);
    expect(useAuthStore.getState().vaultBKey).toBeNull();
  });

  it('panic-close drops the Vault B key; re-unlock requires re-entry', async () => {
    await useAuthStore.getState().loginWithPassphrase('op', 'login-pass-A', 'Lead');
    await useAuthStore.getState().unlockVaultB('vault-b-pass');
    expect(useAuthStore.getState().vaultBKey).not.toBeNull();

    useAuthStore.getState().panicWipeVaultB();
    expect(useAuthStore.getState().vaultBKey).toBeNull();

    // Correct passphrase re-opens it.
    const ok = await useAuthStore.getState().unlockVaultB('vault-b-pass');
    expect(ok).toBe(true);
    expect(useAuthStore.getState().vaultBKey).not.toBeNull();
  });

  it('logout wipes both vault keys', async () => {
    await useAuthStore.getState().loginWithPassphrase('op', 'login-pass-A', 'Lead');
    await useAuthStore.getState().unlockVaultB('vault-b-pass');
    useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.vaultAKey).toBeNull();
    expect(s.vaultBKey).toBeNull();
    expect(s.isAuthenticated).toBe(false);
  });
});
