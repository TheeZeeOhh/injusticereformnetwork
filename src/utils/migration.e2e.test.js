import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { putRawRecord, loadSecureRecord, getAllRecords } from './storageEngine';
import { migrateRecordsToV2 } from './migrationEngine';

// End-to-end migration through REAL IndexedDB + REAL WebCrypto: seed a legacy v1
// record (no magic, no AAD), run the migration, and prove the upgraded record is
// (a) now v2, (b) readable via loadSecureRecord with its AAD, and (c) a no-op on
// a second pass (idempotent).

async function makeKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Write a genuine v1 blob (IV(12) || ciphertext, no magic, no AAD) straight into
// the store, mimicking a record created before the C2 change.
async function seedV1Record(key, id, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(data))
  );
  const payload = new Uint8Array(iv.length + ct.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(ct), iv.length);
  await putRawRecord({ id, data: payload });
}

describe('v1->v2 migration (real IndexedDB + WebCrypto)', () => {
  let keyA;
  let keyB;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    // In production A and B keys differ; the migration only requires that each
    // record is decrypted under the key that wrote it. Using distinct keys here
    // also proves the vault routing picks the right one.
    keyA = await makeKey();
    keyB = await makeKey();
  });

  it('upgrades a legacy Vault A record so it reads back with AAD', async () => {
    await seedV1Record(keyA, 'client_directory', [{ id: 'c1', name: 'Ada' }]);

    const res = await migrateRecordsToV2(keyA, keyB);
    expect(res.migrated).toBe(1);
    expect(res.failed).toBe(0);

    // Now v2: carries the magic prefix...
    const [rec] = await getAllRecords();
    expect(Array.from(rec.data.slice(0, 4))).toEqual([0x53, 0x41, 0x02, 0x00]);
    // ...and decrypts through the AAD-bound load path.
    expect(await loadSecureRecord(keyA, 'client_directory', 'A')).toEqual([
      { id: 'c1', name: 'Ada' }
    ]);
  });

  it('routes a Vault B id to the Vault B key and tag', async () => {
    await seedV1Record(keyB, 'hrt_client7', { regimen: 'sensitive' });

    const res = await migrateRecordsToV2(keyA, keyB);
    expect(res.migrated).toBe(1);

    // Must be readable under Vault B, and NOT under Vault A (wrong key + tag).
    expect(await loadSecureRecord(keyB, 'hrt_client7', 'B')).toEqual({
      regimen: 'sensitive'
    });
    await expect(loadSecureRecord(keyA, 'hrt_client7', 'A')).rejects.toThrow();
  });

  it('is idempotent: a second pass migrates nothing', async () => {
    await seedV1Record(keyA, 'vouchers', [{ id: 'V1' }]);
    const first = await migrateRecordsToV2(keyA, keyB);
    expect(first.migrated).toBe(1);

    const second = await migrateRecordsToV2(keyA, keyB);
    expect(second.migrated).toBe(0);
    expect(second.skipped).toBe(1);
  });
});
