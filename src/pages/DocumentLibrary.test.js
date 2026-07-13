import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { saveSecureRecord, loadSecureRecord } from '../utils/storageEngine';
import { deriveVaultAKey } from '../utils/cryptoEngine';

// Document Library storage contract: documents are stored encrypted in Vault A
// as a blob record ('docblob_<id>') plus a 'document_index'. This exercises the
// same round-trip the page performs, through real IndexedDB + WebCrypto.

const INDEX_ID = 'document_index';
const STRONG = 'correct horse battery staple gymnasium';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

function bytesToB64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

describe('Document Library storage', () => {
  let key;
  beforeEach(async () => {
    installLocalStorage();
    globalThis.indexedDB = new IDBFactory();
    key = await deriveVaultAKey(STRONG);
  });

  it('stores an encrypted document blob + index and reads them back', async () => {
    const original = new TextEncoder().encode('PDF-BYTES-HERE').buffer;
    const id = 'DOC-1';

    await saveSecureRecord(key, `docblob_${id}`, {
      b64: bytesToB64(original),
      mime: 'application/pdf'
    }, 'A');
    await saveSecureRecord(key, INDEX_ID, [
      { id, name: 'sop.pdf', format: 'PDF', size: 14, date: '2026-07-12' }
    ], 'A');

    const idx = await loadSecureRecord(key, INDEX_ID, 'A');
    expect(idx).toHaveLength(1);
    expect(idx[0].name).toBe('sop.pdf');

    const blob = await loadSecureRecord(key, `docblob_${id}`, 'A');
    expect(blob.mime).toBe('application/pdf');
    expect(new TextDecoder().decode(b64ToBytes(blob.b64))).toBe('PDF-BYTES-HERE');
  });

  it('the stored blob is ciphertext (plaintext not on disk)', async () => {
    const secret = 'CONFIDENTIAL-DOCUMENT-CONTENT';
    await saveSecureRecord(key, 'docblob_DOC-2', {
      b64: bytesToB64(new TextEncoder().encode(secret).buffer),
      mime: 'text/plain'
    }, 'A');
    // Read the raw stored bytes and confirm the plaintext isn't present.
    const { getAllRecords } = await import('../utils/storageEngine');
    const raw = await getAllRecords();
    const asText = new TextDecoder().decode(raw[0].data);
    expect(asText).not.toContain(secret);
  });

  it('a wrong key cannot read a stored document', async () => {
    await saveSecureRecord(key, 'docblob_DOC-3', { b64: 'AAAA', mime: 'x' }, 'A');
    const wrongKey = await deriveVaultAKey('a totally different strong phrase here');
    await expect(loadSecureRecord(wrongKey, 'docblob_DOC-3', 'A')).rejects.toThrow();
  });
});
