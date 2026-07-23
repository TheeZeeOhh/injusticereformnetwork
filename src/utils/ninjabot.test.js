import { describe, it, expect } from 'vitest';
import {
  detectChainTamper,
  detectAccessBurst,
  detectOffHours,
  detectMassDelete,
  detectVaultBCluster,
  detectForeignEntries,
  analyze,
  SEVERITY,
  DEFAULT_THRESHOLDS,
} from './ninjabot';

const NOW = Date.parse('2026-07-23T14:00:00Z'); // a fixed "now" for determinism
const ago = (ms) => new Date(NOW - ms).toISOString();

function mk(action, opts = {}) {
  return {
    seq: opts.seq ?? 1,
    ts: opts.ts ?? ago(60 * 1000),
    locked: opts.locked ?? false,
    action,
    recordId: opts.recordId ?? 'client_1',
    vaultTag: opts.vaultTag ?? 'A',
  };
}

describe('detectChainTamper', () => {
  it('CRITICAL when chain is broken', () => {
    const f = detectChainTamper({ chain: { ok: false, count: 10, brokenAtSeq: 4 } });
    expect(f.severity).toBe(SEVERITY.CRITICAL);
    expect(f.detail).toContain('#4');
  });
  it('INFO when chain is intact', () => {
    const f = detectChainTamper({ chain: { ok: true, count: 10, brokenAtSeq: null } });
    expect(f.severity).toBe(SEVERITY.INFO);
  });
  it('returns null when no chain supplied', () => {
    expect(detectChainTamper({ chain: null })).toBeNull();
  });
});

describe('detectAccessBurst', () => {
  it('WARN when reads exceed the burst threshold within the window', () => {
    const entries = Array.from({ length: 30 }, () => mk('read', { ts: ago(60 * 1000) }));
    const f = detectAccessBurst({ entries, now: NOW });
    expect(f.severity).toBe(SEVERITY.WARN);
  });
  it('no finding when accesses are below threshold', () => {
    const entries = Array.from({ length: 5 }, () => mk('read'));
    expect(detectAccessBurst({ entries, now: NOW })).toBeNull();
  });
  it('ignores accesses outside the time window', () => {
    const entries = Array.from({ length: 30 }, () => mk('read', { ts: ago(60 * 60 * 1000) })); // 1h ago
    expect(detectAccessBurst({ entries, now: NOW })).toBeNull();
  });
});

describe('detectMassDelete', () => {
  it('CRITICAL on a *ALL* scorched-earth delete', () => {
    const entries = [mk('delete', { recordId: '*ALL*' })];
    const f = detectMassDelete({ entries, now: NOW });
    expect(f.severity).toBe(SEVERITY.CRITICAL);
  });
  it('WARN on many individual deletes', () => {
    const entries = Array.from({ length: 6 }, (_, i) => mk('delete', { recordId: `client_${i}` }));
    const f = detectMassDelete({ entries, now: NOW });
    expect(f.severity).toBe(SEVERITY.WARN);
  });
  it('no finding for a single delete', () => {
    expect(detectMassDelete({ entries: [mk('delete')], now: NOW })).toBeNull();
  });
});

describe('detectVaultBCluster', () => {
  it('WARN on a cluster of Vault B accesses', () => {
    const entries = Array.from({ length: 12 }, () => mk('read', { vaultTag: 'B' }));
    const f = detectVaultBCluster({ entries, now: NOW });
    expect(f.severity).toBe(SEVERITY.WARN);
  });
  it('Vault A accesses do not trigger it', () => {
    const entries = Array.from({ length: 12 }, () => mk('read', { vaultTag: 'A' }));
    expect(detectVaultBCluster({ entries, now: NOW })).toBeNull();
  });
});

describe('detectOffHours', () => {
  it('flags an access at 03:00 local', () => {
    const three = new Date(NOW);
    three.setHours(3, 0, 0, 0);
    const entries = [mk('read', { ts: three.toISOString() })];
    // Only fires if 03:00 also falls in the recent window; use now = that time.
    const f = detectOffHours({ entries, now: three.getTime() });
    expect(f && f.severity).toBe(SEVERITY.INFO);
  });
  it('no finding for a midday access', () => {
    const noon = new Date(NOW);
    noon.setHours(12, 0, 0, 0);
    const entries = [mk('read', { ts: noon.toISOString() })];
    expect(detectOffHours({ entries, now: noon.getTime() })).toBeNull();
  });
});

describe('detectForeignEntries', () => {
  it('INFO when locked and readable entries coexist', () => {
    const entries = [mk('read', { locked: false }), mk('read', { locked: true })];
    const f = detectForeignEntries({ entries });
    expect(f.severity).toBe(SEVERITY.INFO);
  });
  it('no finding when all entries are readable', () => {
    const entries = [mk('read', { locked: false }), mk('write', { locked: false })];
    expect(detectForeignEntries({ entries })).toBeNull();
  });
});

describe('analyze orchestration', () => {
  it('reports INFO status on a clean, intact log', () => {
    const entries = [mk('read'), mk('write')];
    const rep = analyze({ entries, chain: { ok: true, count: 2, brokenAtSeq: null }, now: NOW });
    expect(rep.status).toBe(SEVERITY.INFO);
    // chain-intact info finding is always present
    expect(rep.findings.some((f) => f.id === 'chain_tamper')).toBe(true);
  });

  it('escalates status to CRITICAL when the chain is broken', () => {
    const rep = analyze({ entries: [mk('read')], chain: { ok: false, count: 1, brokenAtSeq: 1 }, now: NOW });
    expect(rep.status).toBe(SEVERITY.CRITICAL);
    expect(rep.findings[0].severity).toBe(SEVERITY.CRITICAL); // sorted worst-first
  });

  it('sorts findings critical → warn → info', () => {
    const entries = [
      ...Array.from({ length: 30 }, () => mk('read')),        // burst → warn
      mk('delete', { recordId: '*ALL*' }),                    // wipe → critical
    ];
    const rep = analyze({ entries, chain: { ok: true, count: 31, brokenAtSeq: null }, now: NOW });
    const sev = rep.findings.map((f) => f.severity);
    const rank = { critical: 0, warn: 1, info: 2 };
    for (let i = 1; i < sev.length; i++) {
      expect(rank[sev[i]]).toBeGreaterThanOrEqual(rank[sev[i - 1]]);
    }
  });

  it('exposes tunable default thresholds', () => {
    expect(DEFAULT_THRESHOLDS.burstCount).toBeGreaterThan(0);
    expect(DEFAULT_THRESHOLDS.massDeleteCount).toBeGreaterThan(0);
  });
});
