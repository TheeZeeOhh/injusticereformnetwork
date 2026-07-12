import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  saveSecureRecord,
  loadSecureRecord,
  getAllRecords,
  putRawRecord
} from './storageEngine';

// End-to-end coverage of the C2 guarantees through the REAL storage engine and
// REAL WebCrypto (no crypto mocks): save -> IndexedDB -> load, and the
// substitution/tamper rejections that the AAD binding is supposed to enforce at
// the storage layer, not just the crypto layer.

async function makeKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

describe('storageEngine (real IndexedDB + WebCrypto)', () => {
  let key;

  beforeEach(async () => {
    // Fresh in-memory IndexedDB per test so records never leak between cases.
    globalThis.indexedDB = new IDBFactory();
    key = await makeKey();
  });

  it('round-trips an encrypted record under matching (vaultTag, id)', async () => {
    const data = { legalName: 'Ada Lovelace', phone: '555' };
    await saveSecureRecord(key, 'client_1', data, 'A');
    expect(await loadSecureRecord(key, 'client_1', 'A')).toEqual(data);
  });

  it('stores ciphertext only (plaintext never hits the DB)', async () => {
    await saveSecureRecord(key, 'client_1', { legalName: 'SecretName' }, 'A');
    const raw = await getAllRecords();
    const bytes = raw[0].data;
    const asText = new TextDecoder().decode(bytes);
    expect(asText).not.toContain('SecretName');
    expect(asText).not.toContain('legalName');
  });

  it('returns null for a missing record', async () => {
    expect(await loadSecureRecord(key, 'nope', 'A')).toBeNull();
  });

  it('FAILS to load when the vaultTag differs from write time', async () => {
    await saveSecureRecord(key, 'shared_id', { v: 1 }, 'A');
    await expect(loadSecureRecord(key, 'shared_id', 'B')).rejects.toThrow(
      /Cryptographic Read Failure/
    );
  });

  it('FAILS when a blob is relocated into another record id', async () => {
    // Seal under client_1, then move its raw ciphertext into the client_2 slot.
    await saveSecureRecord(key, 'client_1', { who: 1 }, 'A');
    const [rec] = await getAllRecords();
    await putRawRecord({ id: 'client_2', data: rec.data });

    // Reading client_2 with client_2's AAD must fail: the ciphertext is bound to
    // client_1. This is the C2 anti-substitution property at the storage layer.
    await expect(loadSecureRecord(key, 'client_2', 'A')).rejects.toThrow(
      /Cryptographic Read Failure/
    );
    // ...and the original slot still decrypts fine.
    expect(await loadSecureRecord(key, 'client_1', 'A')).toEqual({ who: 1 });
  });

  it('produces v2 payloads carrying the envelope magic prefix', async () => {
    await saveSecureRecord(key, 'client_1', { a: 1 }, 'A');
    const [rec] = await getAllRecords();
    expect(Array.from(rec.data.slice(0, 4))).toEqual([0x53, 0x41, 0x02, 0x00]);
  });
});
