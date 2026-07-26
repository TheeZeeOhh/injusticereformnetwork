// IntelligenceLayer.test.js
//
// BAM (Brief Addiction Monitor) scores are 42 CFR Part 2 SUD data. These tests
// pin the two guarantees behind moving BAM out of the operational server and
// into per-client Vault B:
//   1. appendBamScore's delta/triage logic is correct and deterministic.
//   2. A client's BAM history round-trips through Vault B and is UNREADABLE with
//      the Vault A key (real crypto, not a stub), and is keyed per-client.

import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { saveSecureRecord, loadSecureRecord } from '../utils/storageEngine';
import { deriveVaultAKey, deriveVaultBKey } from '../utils/cryptoEngine';
import { appendBamScore, bamRecordId } from './IntelligenceLayer';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

describe('appendBamScore: deterministic delta / triage logic', () => {
  it('first score never flags (no prior to compare)', () => {
    const r = appendBamScore([], 12, new Date('2026-01-01T00:00:00Z'));
    expect(r.history).toEqual([{ score: 12, timestamp: '2026-01-01T00:00:00.000Z' }]);
    expect(r.flagged).toBe(false);
    expect(r.deltaPct).toBeNull();
  });

  it('flags a >=15% jump from the prior score', () => {
    const prior = [{ score: 10, timestamp: '2026-01-01T00:00:00.000Z' }];
    const r = appendBamScore(prior, 12); // +20%
    expect(r.flagged).toBe(true);
    expect(r.deltaPct).toBeCloseTo(20);
    expect(r.history).toHaveLength(2);
  });

  it('does NOT flag a small (<15%) change', () => {
    const prior = [{ score: 10, timestamp: 't' }];
    const r = appendBamScore(prior, 11); // +10%
    expect(r.flagged).toBe(false);
    expect(r.deltaPct).toBeCloseTo(10);
  });

  it('compares only against the most recent prior score', () => {
    const prior = [{ score: 100, timestamp: 't1' }, { score: 20, timestamp: 't2' }];
    const r = appendBamScore(prior, 21); // vs 20, +5% -> not flagged
    expect(r.flagged).toBe(false);
  });

  it('handles a zero prior score without dividing by zero', () => {
    const prior = [{ score: 0, timestamp: 't' }];
    const r = appendBamScore(prior, 5);
    expect(r.flagged).toBe(false);
    expect(r.deltaPct).toBeNull();
  });
});

describe('bamRecordId is per-client', () => {
  it('produces a distinct, client-scoped record id', () => {
    expect(bamRecordId('client_PT-1001')).toBe('bam_history_client_PT-1001');
    expect(bamRecordId('client_PT-1001')).not.toBe(bamRecordId('client_PT-1002'));
  });
});

describe('BAM history lives in Vault B only (42 CFR Part 2)', () => {
  let aKey, bKey;
  beforeEach(async () => {
    installLocalStorage();
    globalThis.indexedDB = new IDBFactory();
    aKey = await deriveVaultAKey('correct horse battery staple gymnasium');
    bKey = await deriveVaultBKey('a separate strong vault b passphrase');
  });

  it('round-trips a client BAM history through Vault B', async () => {
    const rid = bamRecordId('client_PT-1001');
    const hist = appendBamScore([], 14).history;
    await saveSecureRecord(bKey, rid, hist, 'B');
    expect(await loadSecureRecord(bKey, rid, 'B')).toEqual(hist);
  });

  it('is UNREADABLE with the Vault A key (crypto separation is real)', async () => {
    const rid = bamRecordId('client_PT-1001');
    await saveSecureRecord(bKey, rid, appendBamScore([], 14).history, 'B');
    await expect(loadSecureRecord(aKey, rid, 'B')).rejects.toThrow();
    await expect(loadSecureRecord(aKey, rid, 'A')).rejects.toThrow();
  });

  it('keeps two clients\u2019 histories independent', async () => {
    await saveSecureRecord(bKey, bamRecordId('client_PT-1001'), [{ score: 10, timestamp: 't' }], 'B');
    await saveSecureRecord(bKey, bamRecordId('client_PT-1002'), [{ score: 99, timestamp: 't' }], 'B');
    const c1 = await loadSecureRecord(bKey, bamRecordId('client_PT-1001'), 'B');
    const c2 = await loadSecureRecord(bKey, bamRecordId('client_PT-1002'), 'B');
    expect(c1[0].score).toBe(10);
    expect(c2[0].score).toBe(99);
  });
});
