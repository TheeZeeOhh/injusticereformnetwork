import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  saveSecureRecord,
  loadSecureRecord,
  getAllRecords,
  putRawRecord,
} from './storageEngine';
import {
  deriveVaultAKey,
  deriveVaultBKey,
  vaultBStorageId,
  encryptRecord,
  buildRecordAad,
} from './cryptoEngine';
import { migrateVaultBRecords, vaultHasRecords } from './migrationEngine';
import { appendEntry, getEntries, verifyChain, initAuditKey } from './auditLog';

// Subpoena drill 2026-10-17, finding 1: IndexedDB stores record keys in
// plaintext, so a Vault B record keyed 'hrt_<clientRef>' told anyone holding
// only passphrase A (or none) which client has an HRT / Part 2 record. These
// tests pin the fix: Vault B records live under opaque per-key ids, legacy
// records move there on unlock, and the audit log stops naming them.

const PASS_A = 'vault-a-login-pass';
const PASS_B = 'independent-vault-b-pass';
const REF = 'PT-7f3a9';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

// Every byte the record store holds, ids included, as one searchable string.
async function rawStoreText() {
  const rows = await getAllRecords();
  return rows.map((r) => r.id + '\u0000' + new TextDecoder('latin1').decode(r.data)).join('\n');
}

// A record exactly as pre-fix code wrote it: v2 envelope, AAD over the logical
// id, stored UNDER that readable id.
async function seedLegacyV2(key, id, data) {
  await putRawRecord({ id, data: await encryptRecord(key, data, buildRecordAad('B', id)) });
}

// A pre-C2 v1 blob (IV || ciphertext, no AAD), also under its readable id.
async function seedLegacyV1(key, id, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data))
  ));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  await putRawRecord({ id, data: out });
}

describe('opaque Vault B storage ids', () => {
  let bKey;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    installLocalStorage();
    bKey = await deriveVaultBKey(PASS_B);
    await initAuditKey(PASS_A);
  });

  it('is deterministic per key, differs under another passphrase, and never contains the ref', async () => {
    const id = await vaultBStorageId(bKey, `hrt_${REF}`);
    expect(id).toMatch(/^vb_[A-Za-z0-9_-]{22}$/);
    expect(id).not.toContain(REF);
    // Same passphrase, freshly derived (a later unlock): same id, so lookups work.
    expect(await vaultBStorageId(await deriveVaultBKey(PASS_B), `hrt_${REF}`)).toBe(id);
    expect(await vaultBStorageId(await deriveVaultBKey('another-b-pass'), `hrt_${REF}`)).not.toBe(id);
    // The kind of record is hidden too: consent and HRT ids share one prefix.
    expect(await vaultBStorageId(bKey, `consent_${REF}_1`)).toMatch(/^vb_/);
  });

  it('stores a Vault B record under its opaque id, with the ref nowhere in the store', async () => {
    await saveSecureRecord(bKey, `hrt_${REF}`, { regimen: 'estradiol' }, 'B');
    const ids = (await getAllRecords()).map((r) => r.id);
    expect(ids).toEqual([await vaultBStorageId(bKey, `hrt_${REF}`)]);
    expect(await rawStoreText()).not.toContain(REF);
    expect(await loadSecureRecord(bKey, `hrt_${REF}`, 'B')).toEqual({ regimen: 'estradiol' });
    // Still classified as Vault B, so the orphaned-records guard (H1) sees it.
    expect(await vaultHasRecords('B')).toBe(true);
  });

  it('fails closed for a Vault B key with no id key: nothing is written', async () => {
    const bare = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await expect(saveSecureRecord(bare, `hrt_${REF}`, { x: 1 }, 'B')).rejects.toThrow();
    expect(await getAllRecords()).toHaveLength(0);
  });

  it('a blob moved to another opaque id fails authentication (AAD binds the logical id)', async () => {
    await saveSecureRecord(bKey, 'hrt_PT-aaaaa', { regimen: 'a' }, 'B');
    const [rec] = await getAllRecords();
    await putRawRecord({ id: await vaultBStorageId(bKey, 'hrt_PT-bbbbb'), data: rec.data });
    await expect(loadSecureRecord(bKey, 'hrt_PT-bbbbb', 'B')).rejects.toThrow();
  });

  it('logs Vault B reads and writes under the opaque id, never the ref', async () => {
    await saveSecureRecord(bKey, `hrt_${REF}`, { regimen: 'x' }, 'B');
    await loadSecureRecord(bKey, `hrt_${REF}`, 'B');
    // Audit appends are fire-and-forget; wait for both to land.
    let entries = [];
    await vi.waitFor(async () => {
      entries = await getEntries();
      expect(entries.filter((e) => e.vaultTag === 'B').map((e) => e.action)).toEqual(['write', 'read']);
    });
    expect(entries.find((e) => e.vaultTag === 'B').recordId).toBe(await vaultBStorageId(bKey, `hrt_${REF}`));
    for (const e of entries) expect(String(e.recordId)).not.toContain(REF);
  });
});

describe('migrateVaultBRecords (legacy readable ids -> opaque)', () => {
  let aKey;
  let bKey;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    installLocalStorage();
    aKey = await deriveVaultAKey(PASS_A);
    bKey = await deriveVaultBKey(PASS_B);
    await initAuditKey(PASS_A);
  });

  it('moves every legacy Vault B kind, keeps Vault A as is, and is a no-op the second time', async () => {
    await seedLegacyV2(bKey, `hrt_${REF}`, { regimen: 'estradiol' });
    await seedLegacyV1(bKey, `consent_${REF}_1700000000000`, { status: 'ACTIVE' });
    await seedLegacyV2(bKey, 'consent_index', [{ id: `consent_${REF}_1700000000000` }]);
    await seedLegacyV2(bKey, `bam_history_client_${REF}`, [{ score: 12 }]);
    await seedLegacyV2(bKey, 'med_index_b', [{ medication: 'Testosterone' }]);
    await seedLegacyV2(bKey, 'saved_resources', ['Trans Lifeline']);
    await saveSecureRecord(aKey, `client_${REF}`, { name: 'canary' }, 'A');

    const res = await migrateVaultBRecords(bKey);
    expect(res).toMatchObject({ moved: 6, conflicts: 0, failed: 0, compacted: true });

    // Every record reads back through its unchanged logical id...
    expect(await loadSecureRecord(bKey, `hrt_${REF}`, 'B')).toEqual({ regimen: 'estradiol' });
    expect(await loadSecureRecord(bKey, `consent_${REF}_1700000000000`, 'B')).toEqual({ status: 'ACTIVE' });
    expect(await loadSecureRecord(bKey, 'consent_index', 'B')).toEqual([{ id: `consent_${REF}_1700000000000` }]);
    expect(await loadSecureRecord(bKey, `bam_history_client_${REF}`, 'B')).toEqual([{ score: 12 }]);
    expect(await loadSecureRecord(bKey, 'med_index_b', 'B')).toEqual([{ medication: 'Testosterone' }]);
    expect(await loadSecureRecord(bKey, 'saved_resources', 'B')).toEqual(['Trans Lifeline']);
    expect(await loadSecureRecord(aKey, `client_${REF}`, 'A')).toEqual({ name: 'canary' });

    // ...and the only readable id left is Vault A's, which is Vault A's business.
    const ids = (await getAllRecords()).map((r) => r.id).sort();
    expect(ids.filter((id) => !id.startsWith('vb_'))).toEqual([`client_${REF}`]);
    expect(ids.filter((id) => id.startsWith('vb_'))).toHaveLength(6);

    expect(await migrateVaultBRecords(bKey)).toMatchObject({ moved: 0, conflicts: 0, failed: 0 });
  });

  it('after a crash between write and delete, keeps the current record and drops the readable copy', async () => {
    // State a crash leaves behind: the opaque copy exists (and was since
    // updated), the readable one was never deleted.
    await seedLegacyV2(bKey, `hrt_${REF}`, { regimen: 'old' });
    await saveSecureRecord(bKey, `hrt_${REF}`, { regimen: 'current' }, 'B');

    const res = await migrateVaultBRecords(bKey);
    expect(res).toMatchObject({ moved: 0, conflicts: 1, failed: 0 });
    expect(await loadSecureRecord(bKey, `hrt_${REF}`, 'B')).toEqual({ regimen: 'current' });
    expect((await getAllRecords()).map((r) => r.id)).toEqual([await vaultBStorageId(bKey, `hrt_${REF}`)]);
  });

  it('leaves a record it cannot decrypt in place rather than destroying it', async () => {
    const otherKey = await deriveVaultBKey('a-different-b-pass');
    await seedLegacyV2(otherKey, `hrt_${REF}`, { regimen: 'x' });
    const res = await migrateVaultBRecords(bKey);
    expect(res).toMatchObject({ moved: 0, failed: 1 });
    // The failure report must not echo the ref it exists to hide.
    expect(JSON.stringify(res.failures)).not.toContain(REF);
    expect((await getAllRecords()).map((r) => r.id)).toEqual([`hrt_${REF}`]);
  });

  it('rewrites past audit entries to opaque ids, keeps the chain valid, and records the rewrite', async () => {
    // Entries as pre-fix code wrote them: readable Vault B ids, sealed under the A-derived key.
    await appendEntry({ action: 'write', recordId: `hrt_${REF}`, vaultTag: 'B' });
    await appendEntry({ action: 'read', recordId: `client_${REF}`, vaultTag: 'A' });
    await appendEntry({ action: 'admin', recordId: 'vaultB_unlock', vaultTag: 'B' });
    await seedLegacyV2(bKey, `hrt_${REF}`, { regimen: 'x' });
    const before = await getEntries();

    const res = await migrateVaultBRecords(bKey);
    expect(res.audit).toMatchObject({ rewritten: 1, compacted: true });

    const after = await getEntries();
    const opaque = await vaultBStorageId(bKey, `hrt_${REF}`);
    expect(after[0]).toMatchObject({ seq: before[0].seq, ts: before[0].ts, action: 'write', recordId: opaque, vaultTag: 'B' });
    // Vault A entries and admin events are left alone.
    expect(after[1].recordId).toBe(`client_${REF}`);
    expect(after[2].recordId).toBe('vaultB_unlock');
    // No Vault B entry names the ref any more.
    for (const e of after.filter((x) => x.vaultTag === 'B')) expect(String(e.recordId)).not.toContain(REF);
    expect(after.some((e) => /^audit_vaultB_ids_rewritten:1:prevHead:[0-9a-f]{64}$/.test(e.recordId))).toBe(true);
    expect((await verifyChain()).ok).toBe(true);
  });

  it('refuses to rewrite an audit chain that is already broken', async () => {
    await appendEntry({ action: 'write', recordId: `hrt_${REF}`, vaultTag: 'B' });
    await appendEntry({ action: 'write', recordId: `hrt_${REF}`, vaultTag: 'B' });
    // Tamper: delete the first row, so the second's prevHash no longer links.
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('SanctuaryAudit', 1);
      req.onsuccess = (e) => {
        const tx = e.target.result.transaction(['auditLog'], 'readwrite');
        tx.objectStore('auditLog').delete(1);
        tx.oncomplete = resolve;
        tx.onerror = (ev) => reject(ev.target.error);
      };
    });
    expect((await verifyChain()).ok).toBe(false);
    const res = await migrateVaultBRecords(bKey);
    expect(res.audit).toMatchObject({ rewritten: 0, refused: 'chain broken' });
  });
});
