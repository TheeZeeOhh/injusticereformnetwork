// Node has WebCrypto on globalThis.crypto, but cryptoEngine.js references it as
// `window.crypto`. Alias window -> globalThis so the crypto engine runs under
// vitest's default (node) environment without pulling in a full DOM.
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

// storageEngine.js uses IndexedDB, which Node lacks. fake-indexeddb/auto
// registers a real, in-memory IndexedDB implementation on globalThis so the
// full save -> store -> load path can be exercised end-to-end in tests.
import 'fake-indexeddb/auto';
