import { describe, it, expect } from 'vitest';
import {
  minCellSize, cellEmittable, quasiIdentifiersOf, phiFieldsOf,
  sinkDecision, sinkAllowed, policyForbids, meetsThreshold
} from './evaluate.js';
import { compile } from './compile.js';

describe('IRNL runtime — aggregation floor', () => {
  it('reads the floor from the canonical spec', () => {
    expect(minCellSize()).toBe(5);
  });

  it('suppresses cells below the floor and emits at or above it', () => {
    expect(cellEmittable(4)).toBe(false);
    expect(cellEmittable(5)).toBe(true);
    expect(cellEmittable(0)).toBe(false);
  });

  it('rejects non-finite counts rather than treating them as large', () => {
    expect(cellEmittable(NaN)).toBe(false);
    expect(cellEmittable(Infinity)).toBe(false);
    expect(cellEmittable(undefined)).toBe(false);
  });

  it('defaults CLOSED when no aggregation policy is declared', () => {
    const { program } = compile('policy other { deny nothing }', { strict: false });
    expect(minCellSize(program)).toBe(Infinity);
    expect(cellEmittable(1e9, program)).toBe(false);
  });
});

describe('IRNL runtime — entity annotations', () => {
  it('reports quasi-identifiers as the combination that must clear the floor', () => {
    expect(quasiIdentifiersOf('Client').sort()).toEqual(['demographic', 'jurisdiction', 'timeframe']);
  });

  it('reports PHI fields', () => {
    expect(phiFieldsOf('Record')).toEqual(['body']);
  });

  it('returns nothing for an unknown entity rather than throwing', () => {
    expect(quasiIdentifiersOf('Nope')).toEqual([]);
  });
});

describe('IRNL runtime — PHI boundary', () => {
  it('denies every network sink', () => {
    for (const sink of ['cloud', 'p2p', 'telemetry', 'sms', 'analytics']) {
      expect(sinkAllowed('phi', sink)).toBe(false);
    }
  });

  it('allows local disk only when the caller asserts encryption', () => {
    expect(sinkAllowed('phi', 'local_disk')).toBe(false);
    expect(sinkAllowed('phi', 'local_disk', { conditions: ['encrypted'] })).toBe(true);
  });

  it('explains why a sink was refused', () => {
    expect(sinkDecision('phi', 'cloud').why).toMatch(/denies sink/);
    expect(sinkDecision('phi', 'local_disk').why).toMatch(/did not assert/);
  });

  it('denies unknown sinks and unknown boundaries by default', () => {
    expect(sinkAllowed('phi', 'carrier_pigeon')).toBe(false);
    expect(sinkAllowed('no_such_boundary', 'local_disk')).toBe(false);
  });

  it('keeps keys out of disk, logs, state and backups', () => {
    for (const sink of ['disk', 'log', 'state', 'backup']) {
      expect(sinkAllowed('keys', sink)).toBe(false);
    }
  });

  it('lets deny win over allow when a sink appears in both', () => {
    const { program } = compile(
      'boundary b {\n deny sink(x)\n allow sink(x)\n}',
      { strict: false }
    );
    expect(sinkAllowed('b', 'x', {}, program)).toBe(false);
  });
});

describe('IRNL runtime — policies', () => {
  it('forbids cross-keying and passphrase caching between vaults', () => {
    expect(policyForbids('vault_separation', 'cross_key')).toBe(true);
    expect(policyForbids('vault_separation', 'cache_passphrase')).toBe(true);
  });

  it('enforces the hive-mind source floor', () => {
    expect(meetsThreshold('hive_admission', 'source_count', 4)).toBe(false);
    expect(meetsThreshold('hive_admission', 'source_count', 5)).toBe(true);
  });

  it('defaults closed for undeclared policies and thresholds', () => {
    expect(policyForbids('no_such_policy', 'anything')).toBe(true);
    expect(meetsThreshold('no_such_policy', 'x', 1e9)).toBe(false);
    expect(meetsThreshold('hive_admission', 'undeclared_metric', 1e9)).toBe(false);
  });
});
