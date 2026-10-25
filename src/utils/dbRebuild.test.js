import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { rebuildDatabase, recoverInterruptedRebuild } from './dbRebuild';

// The rebuild exists to make deleted rows' bytes disappear from the SQLite
// files (which fake-indexeddb cannot show; the subpoena drill checks that on
// the real WebKit store). What CAN be pinned here is that it never loses data:
// live rows survive byte for byte, and a crash at any step is recoverable.

const SPEC = { name: 'TestVault', version: 1, store: 'records', keyPath: 'id' };

function open(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    if (upgrade) req.onupgradeneeded = (e) => upgrade(e.target.result);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function seed(rows) {
  const db = await open(SPEC.name, 1, (d) => d.createObjectStore('records', { keyPath: 'id' }));
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['records'], 'readwrite');
    for (const r of rows) tx.objectStore('records').put(r);
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
  db.close();
}

async function rows(name = SPEC.name, store = 'records') {
  const db = await open(name);
  if (!db.objectStoreNames.contains(store)) { db.close(); return null; }
  const out = await new Promise((resolve, reject) => {
    const req = db.transaction([store], 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
  db.close();
  return out;
}

async function exists(name) {
  const dbs = await indexedDB.databases();
  return dbs.some((d) => d.name === name);
}

const ROWS = [
  { id: 'client_directory', data: new Uint8Array([1, 2, 3]) },
  { id: 'vb_abc', data: new Uint8Array([9, 8, 7, 6]) },
];

describe('rebuildDatabase', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('keeps every live row byte for byte and removes the staging copy', async () => {
    await seed(ROWS);
    const res = await rebuildDatabase(SPEC);
    expect(res.rows).toBe(2);
    expect(await rows()).toEqual(ROWS);
    expect(await exists(SPEC.name + '__rebuild')).toBe(false);
  });

  it('does not block on a connection someone left open', async () => {
    await seed(ROWS);
    const lingering = await open(SPEC.name);
    lingering.onversionchange = () => lingering.close();
    await rebuildDatabase(SPEC);
    expect(await rows()).toEqual(ROWS);
  });

  it('keeps an autoIncrement store\'s keys and continues the sequence', async () => {
    const spec = { name: 'TestAudit', version: 1, store: 'log', keyPath: 'seq', autoIncrement: true };
    const db = await open(spec.name, 1, (d) => d.createObjectStore('log', { keyPath: 'seq', autoIncrement: true }));
    await new Promise((resolve) => {
      const tx = db.transaction(['log'], 'readwrite');
      tx.objectStore('log').add({ v: 'a' });
      tx.objectStore('log').add({ v: 'b' });
      tx.oncomplete = resolve;
    });
    db.close();
    await rebuildDatabase(spec);
    const db2 = await open(spec.name);
    const seq = await new Promise((resolve) => {
      const tx = db2.transaction(['log'], 'readwrite');
      const req = tx.objectStore('log').add({ v: 'c' });
      req.onsuccess = () => resolve(req.result);
    });
    db2.close();
    expect(seq).toBe(3);
    expect((await rows(spec.name, 'log')).map((r) => [r.seq, r.v])).toEqual([[1, 'a'], [2, 'b'], [3, 'c']]);
  });
});

describe('recoverInterruptedRebuild', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  async function stage(stagedRows, meta) {
    const st = await open(SPEC.name + '__rebuild', 1, (d) => {
      d.createObjectStore('rows', { autoIncrement: true });
      d.createObjectStore('meta');
    });
    await new Promise((resolve) => {
      const tx = st.transaction(['rows', 'meta'], 'readwrite');
      for (const r of stagedRows) tx.objectStore('rows').add(r);
      if (meta) tx.objectStore('meta').put(meta, 'complete');
      tx.oncomplete = resolve;
    });
    st.close();
  }

  it('is a no-op, and creates nothing, when no rebuild was interrupted', async () => {
    await seed(ROWS);
    expect(await recoverInterruptedRebuild(SPEC)).toBe(false);
    expect(await exists(SPEC.name + '__rebuild')).toBe(false);
    expect(await rows()).toEqual(ROWS);
  });

  it('restores from a complete staging copy after a crash that deleted the original', async () => {
    await stage(ROWS, { count: 2 });
    // The crash hit after the original was deleted: it does not exist.
    expect(await exists(SPEC.name)).toBe(false);
    expect(await recoverInterruptedRebuild(SPEC)).toBe(true);
    expect(await rows()).toEqual(ROWS);
    expect(await exists(SPEC.name + '__rebuild')).toBe(false);
  });

  it('restores over a half-rewritten original', async () => {
    await seed([ROWS[0]]); // the rewrite got one row in before the crash
    await stage(ROWS, { count: 2 });
    expect(await recoverInterruptedRebuild(SPEC)).toBe(true);
    expect(await rows()).toEqual(ROWS);
  });

  it('discards an incomplete staging copy and leaves the original untouched', async () => {
    await seed(ROWS);
    await stage([ROWS[0]], null); // no 'complete' marker: staging never finished
    expect(await recoverInterruptedRebuild(SPEC)).toBe(false);
    expect(await rows()).toEqual(ROWS);
    expect(await exists(SPEC.name + '__rebuild')).toBe(false);
  });
});
