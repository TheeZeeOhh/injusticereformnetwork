import { describe, it, expect, beforeAll } from 'vitest';
import { encryptRecord, decryptRecord, buildRecordAad } from './cryptoEngine';

// Task #3 — AAD content binding (finding C2).
//
// These assert the (vaultTag, recordId) binding that storageEngine constructs
// via buildRecordAad and passes to encrypt/decrypt. This is the security
// guarantee: a v2 blob only decrypts under the exact slot it was sealed for.

async function makeKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Mirror what storageEngine does: seal/open a record bound to (vaultTag, id).
async function seal(key, vaultTag, recordId, data) {
  return encryptRecord(key, data, buildRecordAad(vaultTag, recordId));
}
async function open(key, vaultTag, recordId, payload) {
  return decryptRecord(key, payload, buildRecordAad(vaultTag, recordId));
}

describe('buildRecordAad', () => {
  it('produces the documented canonical form', () => {
    const aad = new TextDecoder().decode(buildRecordAad('B', 'client_42'));
    expect(aad).toBe('sanctuaryv2|B|client_42');
  });

  it('rejects an invalid vaultTag', () => {
    expect(() => buildRecordAad('C', 'x')).toThrow();
    expect(() => buildRecordAad(undefined, 'x')).toThrow();
  });

  it('rejects an empty recordId', () => {
    expect(() => buildRecordAad('A', '')).toThrow();
  });
});

describe('record identity binding (C2)', () => {
  let key;
  beforeAll(async () => {
    key = await makeKey();
  });

  it('round-trips under the correct (vaultTag, id)', async () => {
    const data = { legalName: 'Ada Lovelace' };
    const blob = await seal(key, 'A', 'client_1', data);
    expect(await open(key, 'A', 'client_1', blob)).toEqual(data);
  });

  it('FAILS when the blob is relocated to a different recordId', async () => {
    const blob = await seal(key, 'A', 'client_1', { legalName: 'Ada' });
    // Attacker copies client_1's ciphertext into the client_2 slot.
    await expect(open(key, 'A', 'client_2', blob)).rejects.toThrow();
  });

  it('FAILS when a Vault B blob is replayed into a Vault A slot', async () => {
    const blob = await seal(key, 'B', 'hrt_x', { regimen: 'sensitive' });
    // Same key here (test artifact); the vaultTag alone must gate it.
    await expect(open(key, 'A', 'hrt_x', blob)).rejects.toThrow();
  });

  it('FAILS when the same id is read under the wrong vaultTag', async () => {
    const blob = await seal(key, 'A', 'shared_id', { v: 1 });
    await expect(open(key, 'B', 'shared_id', blob)).rejects.toThrow();
  });

  it('two records under different ids are not interchangeable', async () => {
    const a = await seal(key, 'A', 'client_1', { who: 1 });
    const b = await seal(key, 'A', 'client_2', { who: 2 });
    expect(await open(key, 'A', 'client_1', a)).toEqual({ who: 1 });
    expect(await open(key, 'A', 'client_2', b)).toEqual({ who: 2 });
    await expect(open(key, 'A', 'client_2', a)).rejects.toThrow();
    await expect(open(key, 'A', 'client_1', b)).rejects.toThrow();
  });
});
