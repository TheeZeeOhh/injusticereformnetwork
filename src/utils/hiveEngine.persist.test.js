import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { HiveMindEngine } from './hiveEngine';
import { deriveHiveKey, deriveVaultAKey, buildRecordAad } from './cryptoEngine';
import { getAllRecords, loadSecureRecord } from './storageEngine';

// Encrypted persistence for the hive-mind (tag 'H').
//
// Covers: the new AAD tag, the derived hive key's stability + independence from
// the Vault A/B keys, a full persist -> hydrate round-trip through REAL IndexedDB
// and REAL WebCrypto, and the tamper path where a hand-edited persisted entry is
// dropped by the re-run admission gate on hydrate.

const PASS_A = 'correct horse battery staple';

// A per-install salt store (dev/localStorage path — no Tauri here) so deriveHiveKey
// and deriveVaultAKey have stable salts to work from.
function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: vi.fn((k) => (store.has(k) ? store.get(k) : null)),
    setItem: vi.fn((k, v) => { store.set(k, String(v)); }),
    removeItem: vi.fn((k) => { store.delete(k); }),
  };
  delete globalThis.window?.__TAURI_INTERNALS__;
}

const admissible = (over = {}) => ({
  sourceText: 'Baltimore City Circuit Court filing fee is $165, verified.',
  ...over,
});
const VEC = () => new Array(768).fill(0).map((_, i) => Math.sin(i));

async function seedEngine() {
  const h = new HiveMindEngine();
  await h.insert('fee_baltimore', VEC(), 1, admissible());
  await h.insert('form_ccdr020', VEC(), 2, admissible({
    sourceText: 'Form CC-DR-020 is rejected if block 7 is blank.',
  }));
  await h.insert('clerk_norfolk', VEC(), 3, admissible({
    sourceText: 'Norfolk clerk office responds within 3 business days on average.',
    lastVerifiedBy: '757 intake',
  }));
  return h;
}

describe('buildRecordAad — tag H', () => {
  it('produces the canonical hive AAD form', () => {
    const aad = new TextDecoder().decode(buildRecordAad('H', 'hive_mind_store'));
    expect(aad).toBe('sanctuaryv2|H|hive_mind_store');
  });
  it('still accepts A and B', () => {
    expect(new TextDecoder().decode(buildRecordAad('A', 'x'))).toBe('sanctuaryv2|A|x');
    expect(new TextDecoder().decode(buildRecordAad('B', 'x'))).toBe('sanctuaryv2|B|x');
  });
  it('rejects any other tag', () => {
    expect(() => buildRecordAad('C', 'x')).toThrow(/expected 'A', 'B', or 'H'/);
    expect(() => buildRecordAad('h', 'x')).toThrow(); // case-sensitive
  });
});

describe('deriveHiveKey', () => {
  beforeEach(() => { installLocalStorage(); });

  it('is stable across calls for the same passphrase + install', async () => {
    const k1 = await deriveHiveKey(PASS_A);
    const k2 = await deriveHiveKey(PASS_A);
    // Same key => a blob sealed by one decrypts under the other (AES-GCM is the
    // check; equal CryptoKey objects are not directly comparable).
    const enc = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: new Uint8Array(12) }, k1, new Uint8Array([1, 2, 3]),
    );
    const dec = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(12) }, k2, enc,
    ));
    expect(Array.from(dec)).toEqual([1, 2, 3]);
  });

  it('differs from the Vault A key (distinct salt) — A-sealed blob fails under H key', async () => {
    const aKey = await deriveVaultAKey(PASS_A);
    const hKey = await deriveHiveKey(PASS_A);
    const enc = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: new Uint8Array(12) }, aKey, new Uint8Array([9]),
    );
    await expect(crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(12) }, hKey, enc,
    )).rejects.toBeTruthy();
  });
});

describe('HiveMindEngine persist / hydrate (real IndexedDB + WebCrypto)', () => {
  let hiveKey;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    installLocalStorage();
    hiveKey = await deriveHiveKey(PASS_A);
  });

  it('round-trips admitted entries through an encrypted blob', async () => {
    const src = await seedEngine();
    const written = await src.persist(hiveKey);
    expect(written).toBe(3);

    const fresh = new HiveMindEngine();
    const { admitted, dropped } = await fresh.hydrate(hiveKey);
    expect(admitted).toBe(3);
    expect(dropped).toBe(0);

    const keys = fresh.flatten().map(n => n.key).sort();
    expect(keys).toEqual(['clerk_norfolk', 'fee_baltimore', 'form_ccdr020']);
  });

  it('persists ciphertext only — source text never hits the DB in the clear', async () => {
    const src = await seedEngine();
    await src.persist(hiveKey);
    const raw = await getAllRecords();
    const asText = new TextDecoder().decode(raw[0].data);
    expect(asText).not.toContain('Baltimore City Circuit Court');
    expect(asText).not.toContain('CC-DR-020');
  });

  it('is bound to tag H — the blob will not load under tag A', async () => {
    const src = await seedEngine();
    await src.persist(hiveKey);
    // Same key, wrong tag => AAD mismatch => read failure (namespace binding).
    await expect(loadSecureRecord(hiveKey, 'hive_mind_store', 'A')).rejects.toThrow(
      /Cryptographic Read Failure/,
    );
  });

  it('hydrate on an empty store (first run) yields zeros, not an error', async () => {
    const fresh = new HiveMindEngine();
    expect(await fresh.hydrate(hiveKey)).toEqual({ admitted: 0, dropped: 0 });
  });

  it('DROPS a tampered entry whose text became person-identifying', async () => {
    const src = await seedEngine();
    await src.persist(hiveKey);

    // Simulate a local attacker with IndexedDB + hive-key access: decrypt the
    // blob, poison one entry's sourceText, and re-seal it under the SAME key/slot
    // so the ciphertext is valid — the ONLY thing standing between the poison and
    // the rebuilt store is hydrate's re-run admission gate.
    const payload = await loadSecureRecord(hiveKey, 'hive_mind_store', 'H');
    const target = payload.entries.find(e => e.key === 'fee_baltimore');
    target.candidate.sourceText = 'my client John Smith, DOB on file';

    // Reseal exactly as persist() does, by giving a throwaway engine the mutated
    // entries to serialize. (This deliberately bypasses insert()'s gate to forge
    // the on-disk blob — which is the attack we are defending against.)
    const forger = new HiveMindEngine();
    forger.serialize = () => payload.entries;
    await forger.persist(hiveKey);

    const fresh = new HiveMindEngine();
    const { admitted, dropped } = await fresh.hydrate(hiveKey);
    expect(dropped).toBe(1);
    expect(admitted).toBe(2);
    // The poisoned key never made it into the rebuilt store.
    expect(fresh.flatten().map(n => n.key)).not.toContain('fee_baltimore');
  });
});
