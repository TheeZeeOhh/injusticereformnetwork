import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

// Mock the OS wipe bridge so login interception can be asserted without Tauri.
const { wipeMock } = vi.hoisted(() => ({ wipeMock: vi.fn(() => Promise.resolve()) }));
vi.mock('../utils/duressBridge', () => ({ triggerDuressWipe: wipeMock }));

import { useAuthStore } from './authStore';
import { enrollDuressPassphrase } from '../utils/cryptoEngine';

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
}

function resetStore() {
  useAuthStore.setState({
    user: null, isAuthenticated: false, isOnboarded: false,
    isDecrypting: false, error: null,
    vaultAKey: null, vaultBKey: null, vaultBError: null, hiveKey: null
  });
}

describe('duress passphrase interception (authStore.login)', () => {
  beforeEach(() => {
    installLocalStorage();
    globalThis.indexedDB = new IDBFactory();
    wipeMock.mockClear();
    resetStore();
  });

  it('a duress passphrase fires the wipe and does NOT authenticate', async () => {
    const store = useAuthStore.getState();

    // First real login enrolls Vault A under VAULT_PASS.
    await store.loginWithPassphrase('nav', VAULT_PASS, 'Lead Navigator');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    useAuthStore.getState().logout();

    // Enroll a distinct duress passphrase.
    await enrollDuressPassphrase(DURESS_PASS);

    // Entering the duress passphrase: wipe fires, login fails identically.
    await useAuthStore.getState().loginWithPassphrase('nav', DURESS_PASS, 'Lead Navigator');
    const s = useAuthStore.getState();
    expect(wipeMock).toHaveBeenCalledTimes(1);
    expect(s.isAuthenticated).toBe(false);
    expect(s.vaultAKey).toBeNull();
    expect(s.error).toMatch(/incorrect passphrase/i);
  });

  it('the real passphrase still logs in and never fires the wipe', async () => {
    const store = useAuthStore.getState();
    await store.loginWithPassphrase('nav', VAULT_PASS, 'Lead Navigator');
    useAuthStore.getState().logout();
    await enrollDuressPassphrase(DURESS_PASS);

    await useAuthStore.getState().loginWithPassphrase('nav', VAULT_PASS, 'Lead Navigator');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(wipeMock).not.toHaveBeenCalled();
  });
});
