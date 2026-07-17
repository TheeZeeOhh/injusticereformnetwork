import { describe, it, expect, beforeEach } from 'vitest';
import { ensureSaltsInitialized, deriveVaultAKey } from './cryptoEngine';

// Task #15 (finding L2): a present-but-corrupt salt store must NOT be silently
// regenerated (that would orphan every existing record). Only a genuinely empty
// store may generate fresh salts.

const SALT_KEY = 'sanctuary_vault_salts_v1';

function installLocalStorage(initial) {
  const store = new Map(initial ? Object.entries(initial) : []);
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    _dump: () => store.get(SALT_KEY)
  };
  return store;
}

describe('salt store corruption handling (L2)', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('generates salts on a genuinely empty store (first run)', async () => {
    expect(globalThis.localStorage.getItem(SALT_KEY)).toBeNull();
    await ensureSaltsInitialized();
    const raw = globalThis.localStorage.getItem(SALT_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw);
    expect(parsed.saltA).toBeTruthy();
    expect(parsed.saltB).toBeTruthy();
  });

  it('is stable: a second call does not change existing salts', async () => {
    await ensureSaltsInitialized();
    const first = globalThis.localStorage.getItem(SALT_KEY);
    await ensureSaltsInitialized();
    expect(globalThis.localStorage.getItem(SALT_KEY)).toBe(first);
  });

  it('THROWS on an unparseable salt store instead of regenerating', async () => {
    const store = installLocalStorage({ [SALT_KEY]: 'not-json{{{' });
    await expect(ensureSaltsInitialized()).rejects.toThrow(/corrupt/i);
    // The corrupt value must be left intact (not overwritten).
    expect(store.get(SALT_KEY)).toBe('not-json{{{');
  });

  it('THROWS on a parseable store missing saltA/saltB', async () => {
    const store = installLocalStorage({ [SALT_KEY]: JSON.stringify({ foo: 1 }) });
    await expect(ensureSaltsInitialized()).rejects.toThrow(/missing saltA/i);
    expect(store.get(SALT_KEY)).toBe(JSON.stringify({ foo: 1 }));
  });

  it('key derivation surfaces the corruption rather than deriving a wrong key', async () => {
    installLocalStorage({ [SALT_KEY]: 'garbage' });
    await expect(deriveVaultAKey('correct horse battery staple gymnasium')).rejects.toThrow(/corrupt/i);
  });
});
