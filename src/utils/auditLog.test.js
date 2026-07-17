import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  appendEntry,
  getEntries,
  verifyChain,
  initAuditKey,
  clearAuditKey,
} from './auditLog';

const STRONG = 'correct horse battery staple gymnasium';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

// Raw read of the underlying store, bypassing decryption — used to simulate an
// attacker editing the on-disk log.
function rawRows() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('SanctuaryAudit', 1);
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction(['auditLog'], 'readonly');
      const g = tx.objectStore('auditLog').getAll();
      g.onsuccess = () => resolve(g.result || []);
      g.onerror = (ev) => reject(ev.target.error);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

function putRow(row) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('SanctuaryAudit', 1);
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction(['auditLog'], 'readwrite');
      tx.objectStore('auditLog').put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = (ev) => reject(ev.target.error);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

function deleteRow(seq) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('SanctuaryAudit', 1);
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction(['auditLog'], 'readwrite');
      tx.objectStore('auditLog').delete(seq);
      tx.oncomplete = () => resolve();
      tx.onerror = (ev) => reject(ev.target.error);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

describe('tamper-evident audit log', () => {
  beforeEach(async () => {
    installLocalStorage();
    indexedDB = new IDBFactory(); // fresh DB per test
    clearAuditKey();
    await initAuditKey(STRONG);
  });

  it('appends and verifies an intact chain', async () => {
    await appendEntry({ action: 'write', recordId: 'client_PT-1', vaultTag: 'A' });
    await appendEntry({ action: 'read', recordId: 'client_PT-1', vaultTag: 'A' });
    await appendEntry({ action: 'read', recordId: 'intake_x', vaultTag: 'B' });

    const result = await verifyChain();
    expect(result.ok).toBe(true);
    expect(result.count).toBe(3);
  });

  it('decrypts entry contents when the key is present', async () => {
    await appendEntry({ action: 'read', recordId: 'client_PT-42', vaultTag: 'B' });
    const [entry] = await getEntries();
    expect(entry.locked).toBe(false);
    expect(entry.action).toBe('read');
    expect(entry.recordId).toBe('client_PT-42');
    expect(entry.vaultTag).toBe('B');
  });

  it('does NOT store sensitive fields in plaintext on disk', async () => {
    await appendEntry({ action: 'read', recordId: 'client_PT-SECRET', vaultTag: 'B' });
    const rows = await rawRows();
    const blob = JSON.stringify(rows);
    // The recordId / vaultTag must not appear in cleartext anywhere on disk.
    expect(blob).not.toContain('client_PT-SECRET');
    expect(rows[0].sealed).toBeTypeOf('string');
  });

  it('renders entries unreadable but still verifiable when locked', async () => {
    await appendEntry({ action: 'read', recordId: 'client_PT-9', vaultTag: 'B' });
    clearAuditKey(); // simulate logout / panic / seizure

    const [entry] = await getEntries();
    expect(entry.locked).toBe(true);
    expect(entry.recordId).toBeNull();
    expect(entry.vaultTag).toBeNull();

    // Integrity is independent of readability: the chain still verifies.
    const result = await verifyChain();
    expect(result.ok).toBe(true);
  });

  it('detects an edited entry', async () => {
    await appendEntry({ action: 'write', recordId: 'client_PT-1', vaultTag: 'A' });
    await appendEntry({ action: 'read', recordId: 'client_PT-1', vaultTag: 'A' });

    const rows = await rawRows();
    const target = rows[0];
    target.sealed = target.sealed.slice(0, -4) + 'AAAA'; // corrupt the ciphertext
    await putRow(target);

    const result = await verifyChain();
    expect(result.ok).toBe(false);
    expect(result.brokenAtSeq).toBe(target.seq);
  });

  it('detects a deleted (removed) entry', async () => {
    await appendEntry({ action: 'write', recordId: 'a', vaultTag: 'A' });
    await appendEntry({ action: 'read', recordId: 'b', vaultTag: 'A' });
    await appendEntry({ action: 'read', recordId: 'c', vaultTag: 'A' });

    const rows = await rawRows();
    await deleteRow(rows[1].seq); // excise the middle link

    const result = await verifyChain();
    expect(result.ok).toBe(false);
    // The entry after the hole no longer chains to its expected prevHash.
    expect(result.brokenAtSeq).toBe(rows[2].seq);
  });

  it('records admin actions in the same sealed chain', async () => {
    await appendEntry({ action: 'admin', recordId: 'vaultB_panic_close', vaultTag: 'B' });
    await appendEntry({ action: 'admin', recordId: 'backup_export', vaultTag: null });

    const entries = await getEntries();
    expect(entries.map((e) => e.action)).toEqual(['admin', 'admin']);
    expect(entries[0].recordId).toBe('vaultB_panic_close');
    expect(entries[1].recordId).toBe('backup_export');

    // Admin events are sealed like everything else: no plaintext on disk.
    const rows = await rawRows();
    expect(JSON.stringify(rows)).not.toContain('vaultB_panic_close');

    const result = await verifyChain();
    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
  });

  it('does not fork the chain under concurrent appends', async () => {
    // Fire many appends without awaiting between them: the serialized queue must
    // still produce a single valid chain (no two entries sharing a prevHash).
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        appendEntry({ action: 'read', recordId: `r-${i}`, vaultTag: 'A' })
      )
    );

    const result = await verifyChain();
    expect(result.ok).toBe(true);
    expect(result.count).toBe(25);

    const rows = await rawRows();
    const prevHashes = rows.map((r) => r.prevHash);
    expect(new Set(prevHashes).size).toBe(prevHashes.length); // all distinct → no fork
  });
});
