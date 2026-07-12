import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the storage layer so the migration logic can be tested without IndexedDB.
// getAllRecords yields fixture records; saveSecureRecord records its calls.
const saveCalls = [];
let fixtureRecords = [];

vi.mock('./storageEngine', () => ({
  getAllRecords: async () => fixtureRecords,
  saveSecureRecord: async (key, id, data, vaultTag) => {
    saveCalls.push({ key, id, data, vaultTag });
    return true;
  }
}));

// Encrypt/decrypt: we only need decryptRecord to turn a fixture blob back into
// plaintext, and isV2Payload to gate the skip. Use a tiny deterministic stub so
// tests don't depend on real WebCrypto here (the crypto itself is covered by the
// envelope/AAD suites).
vi.mock('./cryptoEngine', () => ({
  // A "v2" blob is any Uint8Array starting with the magic; "v1" otherwise.
  isV2Payload: (payload) =>
    payload[0] === 0x53 && payload[1] === 0x41 &&
    payload[2] === 0x02 && payload[3] === 0x00,
  // v1 fixture blobs carry their plaintext as JSON after a 1-byte marker; a blob
  // whose marker is 0xFF simulates an undecryptable/corrupt record.
  decryptRecord: async (_key, payload) => {
    if (payload[0] === 0xff) throw new Error('bad auth tag');
    return JSON.parse(new TextDecoder().decode(payload.slice(1)));
  }
}));

import { migrateRecordsToV2, vaultTagForId } from './migrationEngine';

const V2_MAGIC = [0x53, 0x41, 0x02, 0x00];

function v1Blob(obj) {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  return new Uint8Array([0x00, ...json]); // 0x00 marker + JSON
}
function v2Blob() {
  return new Uint8Array([...V2_MAGIC, 1, 2, 3]);
}
function corruptV1Blob() {
  return new Uint8Array([0xff, 9, 9]); // marker forces decrypt to throw
}

describe('vaultTagForId', () => {
  it('routes 42 CFR / HRT ids to Vault B', () => {
    expect(vaultTagForId('consent_index')).toBe('B');
    expect(vaultTagForId('consent_abc_123')).toBe('B');
    expect(vaultTagForId('hrt_client7')).toBe('B');
  });
  it('routes everything else to Vault A', () => {
    expect(vaultTagForId('client_directory')).toBe('A');
    expect(vaultTagForId('evidence_blob_EV-1')).toBe('A');
    expect(vaultTagForId('vouchers')).toBe('A');
  });
});

describe('migrateRecordsToV2', () => {
  const keyA = { tag: 'A' };
  const keyB = { tag: 'B' };

  beforeEach(() => {
    saveCalls.length = 0;
    fixtureRecords = [];
  });

  it('migrates v1 records and binds the correct vaultTag per id', async () => {
    fixtureRecords = [
      { id: 'client_directory', data: v1Blob({ n: 1 }) },
      { id: 'hrt_client7', data: v1Blob({ regimen: 'x' }) }
    ];
    const res = await migrateRecordsToV2(keyA, keyB);

    expect(res.migrated).toBe(2);
    expect(res.failed).toBe(0);
    const a = saveCalls.find((c) => c.id === 'client_directory');
    const b = saveCalls.find((c) => c.id === 'hrt_client7');
    expect(a.vaultTag).toBe('A');
    expect(a.key).toBe(keyA);
    expect(a.data).toEqual({ n: 1 });
    expect(b.vaultTag).toBe('B');
    expect(b.key).toBe(keyB);
  });

  it('skips already-v2 records (idempotent)', async () => {
    fixtureRecords = [
      { id: 'vouchers', data: v2Blob() },
      { id: 'client_directory', data: v1Blob({ n: 1 }) }
    ];
    const res = await migrateRecordsToV2(keyA, keyB);
    expect(res.migrated).toBe(1);
    expect(res.skipped).toBe(1);
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].id).toBe('client_directory');
  });

  it('leaves Vault B records untouched when Vault B is closed (no key)', async () => {
    fixtureRecords = [{ id: 'consent_index', data: v1Blob({ list: [] }) }];
    const res = await migrateRecordsToV2(keyA, null);
    expect(res.migrated).toBe(0);
    expect(res.skipped).toBe(1);
    expect(saveCalls).toHaveLength(0);
  });

  it('counts a corrupt record as failed without aborting the pass', async () => {
    fixtureRecords = [
      { id: 'client_directory', data: corruptV1Blob() },
      { id: 'vouchers', data: v1Blob({ ok: true }) }
    ];
    const res = await migrateRecordsToV2(keyA, keyB);
    expect(res.failed).toBe(1);
    expect(res.migrated).toBe(1); // the good record still migrated
    expect(res.failures[0].id).toBe('client_directory');
  });
});
