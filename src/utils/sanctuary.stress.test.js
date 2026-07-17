import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { saveSecureRecord, loadSecureRecord, nukeStorage } from './storageEngine';
import { deriveVaultAKey } from './cryptoEngine';
import {
  appendEntry, getEntries, verifyChain, initAuditKey, clearAuditKey,
} from './auditLog';
import { normalizeJitsiDomain } from '../store/settingsStore';

// Heavy stress / adversarial suite. Exercises the vault crypto, the audit hash
// chain (esp. the serialized-append queue), and input hardening under volume and
// concurrency. Uses the real IndexedDB + WebCrypto harness, so these are true
// round-trips, not mocks. Kept in the suite for regression; sized to stay under
// a few seconds.

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

function rawAuditRows() {
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

describe('STRESS: vault crypto at volume', () => {
  let key;
  beforeEach(async () => {
    installLocalStorage();
    indexedDB = new IDBFactory();
    clearAuditKey();
    key = await deriveVaultAKey(STRONG);
  });

  it('round-trips 500 distinct records without corruption', async () => {
    const ids = Array.from({ length: 500 }, (_, i) => `client_PT-${i}`);
    await Promise.all(ids.map((id, i) =>
      saveSecureRecord(key, id, { legalName: `Client ${i}`, note: 'x'.repeat(64) }, 'A')
    ));
    // Spot-check a scattered sample decrypts to exactly what went in.
    for (const i of [0, 123, 249, 400, 499]) {
      const rec = await loadSecureRecord(key, `client_PT-${i}`, 'A');
      expect(rec.legalName).toBe(`Client ${i}`);
      expect(rec.note.length).toBe(64);
    }
  });

  it('handles a large payload (base64 chunking path, ~1MB)', async () => {
    const big = { blob: 'A'.repeat(1_000_000) };
    await saveSecureRecord(key, 'docblob_big', big, 'A');
    const out = await loadSecureRecord(key, 'docblob_big', 'A');
    expect(out.blob.length).toBe(1_000_000);
    expect(out.blob).toBe(big.blob);
  });

  it('AAD binding: a record sealed for one id fails to decrypt under another', async () => {
    await saveSecureRecord(key, 'client_PT-1', { s: 'secret' }, 'A');
    // Relocate the ciphertext to a different id, then read with that id's AAD.
    const rec = await new Promise((resolve, reject) => {
      const req = indexedDB.open('SanctuaryVault', 1);
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(['encryptedRecords'], 'readwrite');
        const store = tx.objectStore('encryptedRecords');
        const g = store.get('client_PT-1');
        g.onsuccess = () => {
          store.put({ id: 'client_PT-EVIL', data: g.result.data });
          resolve(true);
        };
        g.onerror = (ev) => reject(ev.target.error);
      };
      req.onerror = (e) => reject(e.target.error);
    });
    expect(rec).toBe(true);
    // The relocated blob must fail authentication (wrong AAD), not silently read.
    await expect(loadSecureRecord(key, 'client_PT-EVIL', 'A')).rejects.toThrow();
  });
});

describe('STRESS: audit chain at volume + concurrency', () => {
  beforeEach(async () => {
    installLocalStorage();
    indexedDB = new IDBFactory();
    clearAuditKey();
    await initAuditKey(STRONG);
  });

  it('1000 concurrent appends produce one valid, unforked chain', async () => {
    await Promise.all(
      Array.from({ length: 1000 }, (_, i) =>
        appendEntry({ action: i % 2 ? 'read' : 'write', recordId: `r-${i}`, vaultTag: i % 3 ? 'A' : 'B' })
      )
    );
    const result = await verifyChain();
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1000);

    // No two entries share a prevHash (no fork), and hashes are all distinct.
    const rows = await rawAuditRows();
    expect(new Set(rows.map((r) => r.prevHash)).size).toBe(1000);
    expect(new Set(rows.map((r) => r.hash)).size).toBe(1000);
  });

  it('interleaved append + verify stays consistent', async () => {
    for (let batch = 0; batch < 10; batch++) {
      await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          appendEntry({ action: 'read', recordId: `b${batch}-${i}`, vaultTag: 'A' })
        )
      );
      const mid = await verifyChain();
      expect(mid.ok).toBe(true);
    }
    const final = await verifyChain();
    expect(final.ok).toBe(true);
    expect(final.count).toBe(500);
  });

  it('every entry in a large chain decrypts back to its input', async () => {
    const n = 200;
    for (let i = 0; i < n; i++) {
      await appendEntry({ action: 'admin', recordId: `evt-${i}`, vaultTag: 'B' });
    }
    const entries = await getEntries();
    expect(entries).toHaveLength(n);
    entries.forEach((e, i) => {
      expect(e.locked).toBe(false);
      expect(e.recordId).toBe(`evt-${i}`);
      expect(e.action).toBe('admin');
    });
  });
});

describe('STRESS: adversarial / fuzz inputs', () => {
  let key;
  beforeEach(async () => {
    installLocalStorage();
    indexedDB = new IDBFactory();
    clearAuditKey();
    key = await deriveVaultAKey(STRONG);
    await initAuditKey(STRONG);
  });

  it('tampered ciphertext fails to decrypt rather than returning garbage', async () => {
    await saveSecureRecord(key, 'client_PT-1', { s: 'secret' }, 'A');
    // Flip bytes in the stored ciphertext.
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('SanctuaryVault', 1);
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(['encryptedRecords'], 'readwrite');
        const store = tx.objectStore('encryptedRecords');
        const g = store.get('client_PT-1');
        g.onsuccess = () => {
          const rec = g.result;
          rec.data[rec.data.length - 1] ^= 0xff; // corrupt last byte
          store.put(rec);
          resolve();
        };
        g.onerror = (ev) => reject(ev.target.error);
      };
      req.onerror = (e) => reject(e.target.error);
    });
    await expect(loadSecureRecord(key, 'client_PT-1', 'A')).rejects.toThrow();
  });

  it('malformed / short blob is rejected, not misread', async () => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('SanctuaryVault', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('encryptedRecords')) {
          db.createObjectStore('encryptedRecords', { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(['encryptedRecords'], 'readwrite');
        tx.objectStore('encryptedRecords').put({ id: 'garbage', data: new Uint8Array([1, 2, 3]) });
        tx.oncomplete = () => resolve();
        tx.onerror = (ev) => reject(ev.target.error);
      };
      req.onerror = (e) => reject(e.target.error);
    });
    await expect(loadSecureRecord(key, 'garbage', 'A')).rejects.toThrow();
  });

  it('fuzzed jitsi domains never yield an unsafe host', () => {
    const inputs = [
      'javascript:alert(1)', 'https://evil.com/@meet.jit.si', 'meet.jit.si/../x',
      '  spaced host ', 'a'.repeat(300), 'メ.example', '://', 'http://', '',
      'ok.example.org', 'HOST.EXAMPLE.ORG:8443',
    ];
    for (const inp of inputs) {
      const out = normalizeJitsiDomain(inp);
      // Result is either '' or a clean host[:port] with no scheme/path/space.
      expect(out === '' || /^[a-z0-9.-]+(:\d+)?$/.test(out)).toBe(true);
      expect(out).not.toContain('/');
      expect(out).not.toContain(' ');
      expect(out).not.toMatch(/^https?:/i); // no scheme survives
    }
    expect(normalizeJitsiDomain('ok.example.org')).toBe('ok.example.org');
    expect(normalizeJitsiDomain('javascript:alert(1)')).toBe('');
  });

  it('weird appointment payloads round-trip as opaque data', async () => {
    const weird = [
      { id: 'appt_1', patientId: 'client_PT-1', startTime: 'not-a-date', status: '💥' },
      { id: 'appt_2', patientId: '', startTime: new Date().toISOString(), status: 'x'.repeat(500) },
      { id: 'appt_3', patientId: 'client_PT-\u0000-null', startTime: '2026-01-01T00:00:00Z', status: null },
    ];
    await saveSecureRecord(key, 'appointments', weird, 'A');
    const out = await loadSecureRecord(key, 'appointments', 'A');
    // The vault is content-agnostic: it must preserve exactly what was stored.
    expect(out).toHaveLength(3);
    expect(out[2].patientId).toBe('client_PT-\u0000-null');
    expect(out[0].status).toBe('💥');
  });
});

describe('STRESS: concurrency races', () => {
  let key;
  beforeEach(async () => {
    installLocalStorage();
    indexedDB = new IDBFactory();
    clearAuditKey();
    key = await deriveVaultAKey(STRONG);
    await initAuditKey(STRONG);
  });

  it('audit appends fired during a nuke still yield a verifiable chain', async () => {
    // Kick off a burst of appends and a nuke concurrently. The audit DB is
    // separate from the vault, so the chain must remain internally consistent
    // regardless of the vault wipe racing alongside.
    const appends = Array.from({ length: 100 }, (_, i) =>
      appendEntry({ action: 'read', recordId: `race-${i}`, vaultTag: 'A' })
    );
    await Promise.all([nukeStorage(), ...appends]);
    const result = await verifyChain();
    expect(result.ok).toBe(true);
  });

  it('overlapping writes to the same key leave a decryptable final value', async () => {
    await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        saveSecureRecord(key, 'client_PT-hot', { v: i }, 'A')
      )
    );
    const out = await loadSecureRecord(key, 'client_PT-hot', 'A');
    // Last-writer-wins is fine; the invariant is that it's a valid, decryptable
    // record with a value from the set written — never corrupt.
    expect(typeof out.v).toBe('number');
    expect(out.v).toBeGreaterThanOrEqual(0);
    expect(out.v).toBeLessThan(40);
  });
});
