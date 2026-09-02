// conformance.test.js — the test that makes IRNL load-bearing.
//
// Everything else in src/irnl/ is a language. THIS file is the reason the
// language exists: it asserts that the code actually shipping to clients agrees
// with src/irnl/spec/irn.irn. If someone lowers MIN_CELL_SIZE in guardrails.js,
// or adds a recovery path to vault B, or lets the PHI boundary reach a network
// sink, this test fails and the commit gate blocks it.
//
// That is the governance rule from CLAUDE.md expressed as code: weakening an
// invariant is possible, but only by deliberately editing a test — never by
// quietly editing a value.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from './compile.js';
import { CANONICAL_SOURCE, loadSpec } from './spec.js';
import { minCellSize, cellEmittable, quasiIdentifiersOf, sinkAllowed } from './evaluate.js';
import * as guardrails from '../utils/guardrails.js';

const program = loadSpec();

describe('IRNL conformance — the spec itself', () => {
  it('compiles with zero errors', () => {
    const { errors } = compile(CANONICAL_SOURCE, { strict: false });
    expect(errors).toEqual([]);
  });

  it('compiles with zero warnings — no invariant is weakened', () => {
    // A warning here means an IRN guardrail has been loosened. Do not silence
    // this by deleting the assertion; change the spec back, or get Aziza's
    // sign-off and change this test deliberately.
    const { warnings } = compile(CANONICAL_SOURCE, { strict: false });
    expect(warnings).toEqual([]);
  });
});

describe('IRNL conformance — guardrails.js agrees with the spec', () => {
  // NOTE: guardrails.js now READS its floor from IRNL, so comparing the two
  // would be a tautology — it could never fail, while still looking like a
  // test. Pin the value to an independent literal instead. This is what keeps
  // the audit trail: changing the floor in the spec breaks this assertion (and
  // guardrails.test.js), so it cannot happen without a deliberate test edit.
  it('the declared floor is 5, and guardrails ships that floor', () => {
    expect(minCellSize(program)).toBe(5);
    expect(guardrails.MIN_CELL_SIZE).toBe(5);
  });

  it('guardrails takes its floor from the spec, not a second literal', () => {
    // A regression guard for the migration itself: if someone re-hardcodes the
    // constant, the spec stops being the single source and this stops holding.
    const source = readFileSync(resolve(import.meta.dirname, '../utils/guardrails.js'), 'utf8');
    expect(source).toMatch(/MIN_CELL_SIZE = minCellSize\(\)/);
    expect(source).not.toMatch(/MIN_CELL_SIZE = \d/);
  });

  it('cellEmittable agrees with the spec across the boundary', () => {
    for (let n = 0; n <= 12; n += 1) {
      expect(guardrails.cellEmittable(n)).toBe(cellEmittable(n, program));
    }
  });

  it('suppressSmallCells drops exactly the cells the spec forbids', () => {
    const rows = [{ n: 1 }, { n: 4 }, { n: 5 }, { n: 99 }];
    const kept = guardrails.suppressSmallCells(rows);
    expect(kept).toEqual(rows.filter((r) => cellEmittable(r.n, program)));
    expect(kept.map((r) => r.n)).toEqual([5, 99]);
  });

  it('aggregateWithPrivacy suppresses on the declared quasi-identifier tuple', () => {
    const qis = quasiIdentifiersOf('Client', program);
    expect(qis.length).toBeGreaterThan(1); // the combination, not one column

    // Five people sharing a QI tuple clear the floor; a lone sixth does not.
    const rows = [
      ...Array.from({ length: 5 }, () => ({ jurisdiction: '757', demographic: 'trans', timeframe: 'w1' })),
      { jurisdiction: '757', demographic: 'trans', timeframe: 'w2' }
    ];
    const { cells, suppressed } = guardrails.aggregateWithPrivacy(rows, qis);
    expect(cells).toHaveLength(1);
    expect(cells[0].n).toBe(5);
    expect(suppressed).toBe(1);
    // The cell of 1 must be absent entirely — suppressed, not rounded.
    expect(cells.some((c) => c.n < guardrails.MIN_CELL_SIZE)).toBe(false);
  });
});

describe('IRNL conformance — declared boundaries hold', () => {
  it('no PHI sink reaches the network', () => {
    for (const sink of ['cloud', 'p2p', 'telemetry', 'sms', 'analytics']) {
      expect(sinkAllowed('phi', sink, {}, program)).toBe(false);
    }
  });

  it('key material has no path to disk, logs, state or backups', () => {
    for (const sink of ['disk', 'log', 'state', 'backup']) {
      expect(sinkAllowed('keys', sink, {}, program)).toBe(false);
    }
  });

  it('vault B remains unrecoverable and closed by default', () => {
    expect(program.vaults.B.recovery).toBe('none');
    expect(program.vaults.B.opens).toBe('explicit_only');
  });

  it('the outbound SMS policy denies PHI, and guardrails enforces it', () => {
    expect(program.policies.outbound_sms.deny).toContain('phi');
    // A body carrying a client name / health detail must be blocked in code.
    expect(guardrails.smsBlocksPhi('Reminder for Jane Doe re: her HRT refill')).toBe(true);
    expect(guardrails.smsBlocksPhi('You have an upcoming appointment.')).toBe(false);
  });
});

describe('IRNL conformance — the gate actually bites', () => {
  it('a lowered floor in the spec produces a warning, not silence', () => {
    const weakened = CANONICAL_SOURCE.replace('min_cell_size    5', 'min_cell_size    2');
    const { warnings } = compile(weakened, { strict: false });
    expect(warnings.some((w) => /min_cell_size is 2/.test(w.message))).toBe(true);
  });

  it('a recovery path added to vault B produces a warning', () => {
    const weakened = CANONICAL_SOURCE.replace('recovery   none', 'recovery   escrow');
    const { warnings } = compile(weakened, { strict: false });
    expect(warnings.some((w) => /vault B recovery/.test(w.message))).toBe(true);
  });

  it('a PHI boundary opened to the cloud produces a warning', () => {
    const weakened = CANONICAL_SOURCE.replace(
      'allow  sink(local_disk) when encrypted',
      'allow  sink(cloud)'
    );
    const { warnings } = compile(weakened, { strict: false });
    expect(warnings.some((w) => /allows network sink "cloud"/.test(w.message))).toBe(true);
  });
});
