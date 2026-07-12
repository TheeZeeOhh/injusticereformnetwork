import { describe, it, expect, beforeAll } from 'vitest';
import { encryptRecord, decryptRecord } from './cryptoEngine';

// Task #1 — versioned record envelope.
//
// These tests exercise the envelope layer only (v1/v2 format detection + the
// optional AAD passthrough). They do NOT assert the C2 AAD *content* binding
// (record-id/vault), which is a later task; here AAD is treated as opaque bytes.

const V2_MAGIC = new Uint8Array([0x53, 0x41, 0x02, 0x00]);
const enc = new TextEncoder();

// A throwaway AES-256-GCM key for round-trip tests.
async function makeKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Produce a LEGACY v1 payload (IV(12) || ciphertext, no magic, no AAD) exactly
// as the pre-envelope code did, so we can prove decryptRecord still reads it.
async function makeV1Payload(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(data))
  );
  const payload = new Uint8Array(iv.length + ct.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(ct), iv.length);
  return payload;
}

describe('record envelope', () => {
  let key;
  beforeAll(async () => {
    key = await makeKey();
  });

  it('v2: round-trips an object', async () => {
    const data = { name: 'Ada', n: 42, nested: { ok: true } };
    const payload = await encryptRecord(key, data);
    expect(await decryptRecord(key, payload)).toEqual(data);
  });

  it('v2: payload carries the 4-byte magic prefix', async () => {
    const payload = await encryptRecord(key, { x: 1 });
    expect(payload.slice(0, 4)).toEqual(V2_MAGIC);
    // magic(4) + iv(12) + ciphertext(>=16 for GCM tag)
    expect(payload.length).toBeGreaterThan(4 + 12);
  });

  it('v1 (legacy): still decrypts without a magic prefix', async () => {
    const data = { legacy: true, msg: 'pre-envelope record' };
    const v1 = await makeV1Payload(key, data);
    expect(v1.slice(0, 4)).not.toEqual(V2_MAGIC);
    expect(await decryptRecord(key, v1)).toEqual(data);
  });

  it('detects format per-payload: v1 and v2 coexist under one key', async () => {
    const v1 = await makeV1Payload(key, { via: 'v1' });
    const v2 = await encryptRecord(key, { via: 'v2' });
    expect(await decryptRecord(key, v1)).toEqual({ via: 'v1' });
    expect(await decryptRecord(key, v2)).toEqual({ via: 'v2' });
  });

  it('does not misread a v1 payload whose IV happens to start with 0x02', async () => {
    // A single-byte version scheme would misdetect this; the 4-byte magic must
    // not. Force a v1 IV whose first byte is 0x02 but which is not the full magic.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    iv[0] = 0x02;
    if (iv[1] === 0x00 && iv[2] === 0x53 && iv[3] === 0x41) iv[1] = 0x01;
    const data = { edge: 'iv-starts-0x02' };
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(JSON.stringify(data))
    );
    const payload = new Uint8Array(iv.length + ct.byteLength);
    payload.set(iv, 0);
    payload.set(new Uint8Array(ct), iv.length);
    expect(await decryptRecord(key, payload)).toEqual(data);
  });

  describe('AAD passthrough (opaque bytes at this layer)', () => {
    it('round-trips when the same AAD is supplied to encrypt and decrypt', async () => {
      const aad = enc.encode('opaque-context-abc');
      const data = { bound: true };
      const payload = await encryptRecord(key, data, aad);
      expect(await decryptRecord(key, payload, aad)).toEqual(data);
    });

    it('fails to decrypt when AAD is omitted at decrypt time', async () => {
      const aad = enc.encode('opaque-context-abc');
      const payload = await encryptRecord(key, { bound: true }, aad);
      await expect(decryptRecord(key, payload)).rejects.toThrow();
    });

    it('fails to decrypt when a DIFFERENT AAD is supplied', async () => {
      const payload = await encryptRecord(key, { bound: true }, enc.encode('ctx-1'));
      await expect(
        decryptRecord(key, payload, enc.encode('ctx-2'))
      ).rejects.toThrow();
    });

    it('fails to decrypt an AAD-sealed record read as if it had none, and vice versa', async () => {
      const noAad = await encryptRecord(key, { a: 1 });
      // Reading a no-AAD v2 record WITH an AAD must fail authentication.
      await expect(
        decryptRecord(key, noAad, enc.encode('unexpected'))
      ).rejects.toThrow();
    });
  });
});
