import { describe, it, expect, beforeEach, vi } from 'vitest';
import { importSaltStore, exportSaltStore, clearSalts } from './cryptoEngine';

// cryptoEngine's salt store uses the OS keychain under Tauri, else localStorage
// in a plain (dev/test) context. There is no Tauri here (window.__TAURI_INTERNALS__
// is undefined), so these exercise the localStorage fallback path — enough to
// verify import -> export -> clear round-trips deterministically.
describe('salt store: import / export / clear (dev localStorage path)', () => {
  beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: vi.fn((k) => (store.has(k) ? store.get(k) : null)),
      setItem: vi.fn((k, v) => { store.set(k, String(v)); }),
      removeItem: vi.fn((k) => { store.delete(k); }),
    };
    // ensure we are NOT seen as Tauri
    delete globalThis.window?.__TAURI_INTERNALS__;
  });

  it('import then export round-trips the salt JSON', async () => {
    const salts = JSON.stringify({ saltA: 'AAAA', saltB: 'BBBB' });
    await importSaltStore(salts);
    expect(await exportSaltStore()).toBe(salts);
  });

  it('clearSalts removes the stored salts (export returns null after)', async () => {
    await importSaltStore(JSON.stringify({ saltA: 'AAAA', saltB: 'BBBB' }));
    expect(await exportSaltStore()).not.toBeNull();
    await clearSalts();
    expect(await exportSaltStore()).toBeNull();
    expect(globalThis.localStorage.removeItem).toHaveBeenCalled();
  });

  it('clearSalts is idempotent on an already-empty store (no throw)', async () => {
    await expect(clearSalts()).resolves.toBeUndefined();
    await expect(clearSalts()).resolves.toBeUndefined();
  });
});
