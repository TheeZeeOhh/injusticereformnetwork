import { describe, it, expect } from 'vitest';
import {
  checkGuardrails,
  blocksHosted,
  cellEmittable,
  suppressSmallCells,
  aggregateWithPrivacy,
  MIN_CELL_SIZE
} from './guardrails';

describe('crisis detection (read generously)', () => {
  it('catches explicit ideation', () => {
    expect(checkGuardrails('I want to kill myself').kind).toBe('crisis');
    expect(checkGuardrails('thinking about suicide').kind).toBe('crisis');
  });

  it("treats 'can't do this anymore' as crisis, not a workflow complaint", () => {
    expect(checkGuardrails("I can't do this anymore").kind).toBe('crisis');
  });

  it('catches imminent-danger and shelter-tonight signals', () => {
    expect(checkGuardrails('he is going to hurt me').kind).toBe('crisis');
    expect(checkGuardrails('I have nowhere to sleep tonight').kind).toBe('crisis');
  });

  it('crisis always blocks hosted routing', () => {
    expect(blocksHosted('I want to end my life')).toBe(true);
  });
});

describe('escalation ceiling', () => {
  it('escalates custody / CPS', () => {
    const r = checkGuardrails('CPS is involved with the kids');
    expect(r.kind).toBe('escalate');
    expect(r.why).toMatch(/custody|CPS/i);
  });

  it('escalates immigration overlap', () => {
    expect(checkGuardrails('there is an immigration hold').kind).toBe('escalate');
  });

  it('escalates violation allegations', () => {
    expect(checkGuardrails('got a violation notice for probation').kind).toBe('escalate');
  });

  it('escalates court-order interpretation', () => {
    expect(checkGuardrails('what does my court order mean').kind).toBe('escalate');
  });

  it('escalation blocks hosted routing', () => {
    expect(blocksHosted('my attorney is handling the active case')).toBe(true);
  });

  it('lets ordinary generic questions through both gates', () => {
    expect(checkGuardrails('what is a continuance').kind).toBe(null);
    expect(blocksHosted('what is a continuance')).toBe(false);
  });
});

describe('aggregate suppression (n < 5)', () => {
  it('suppresses cells below the minimum', () => {
    expect(cellEmittable(4)).toBe(false);
    expect(cellEmittable(5)).toBe(true);
    expect(MIN_CELL_SIZE).toBe(5);
  });

  it('drops small rows including a 1-count quasi-identifier cell', () => {
    const rows = [
      { bucket: '757/trans/this-week', n: 1 },
      { bucket: 'statewide/all/this-month', n: 42 }
    ];
    const out = suppressSmallCells(rows);
    expect(out).toHaveLength(1);
    expect(out[0].bucket).toBe('statewide/all/this-month');
  });
});

describe('aggregateWithPrivacy — quasi-identifier combination k-anonymity', () => {
  // Person-level rows. Each single column has plenty of rows, but a SPECIFIC
  // combination (jurisdiction + demographic) is rare — that combination is the
  // re-identification risk the single-column check misses.
  const rows = [
    // 6 "757 / cis" — safe combination
    ...Array.from({ length: 6 }, () => ({ jurisdiction: '757', demographic: 'cis' })),
    // only 2 "757 / trans" — UNDER the floor as a combination, must be suppressed
    ...Array.from({ length: 2 }, () => ({ jurisdiction: '757', demographic: 'trans' })),
    // 5 "804 / cis" — exactly at floor, safe
    ...Array.from({ length: 5 }, () => ({ jurisdiction: '804', demographic: 'cis' })),
  ];

  it('suppresses a rare QI combination even when each column alone is large', () => {
    const { cells, suppressed, total } = aggregateWithPrivacy(rows, ['jurisdiction', 'demographic']);
    expect(total).toBe(13);
    // '757/trans' (n=2) must NOT appear
    expect(cells.find((c) => c.jurisdiction === '757' && c.demographic === 'trans')).toBeUndefined();
    expect(suppressed).toBe(1);
    // the two safe combinations remain
    expect(cells).toHaveLength(2);
    const safe = cells.find((c) => c.jurisdiction === '757' && c.demographic === 'cis');
    expect(safe.n).toBe(6);
  });

  it('the SAME people counted by jurisdiction alone would leak (proves the combination matters)', () => {
    // by jurisdiction only, '757' has 8 rows -> would emit; but that hides the
    // n=2 trans sub-cell. The combination gate is what prevents the leak.
    const single = aggregateWithPrivacy(rows, ['jurisdiction']);
    const j757 = single.cells.find((c) => c.jurisdiction === '757');
    expect(j757.n).toBe(8);             // safe at the coarse level...
    // ...but the finer combination is suppressed, which is the whole point.
    const combo = aggregateWithPrivacy(rows, ['jurisdiction', 'demographic']);
    expect(combo.cells.some((c) => c.jurisdiction === '757' && c.demographic === 'trans')).toBe(false);
  });

  it('exactly MIN_CELL_SIZE emits; one below suppresses (boundary)', () => {
    const atFloor = Array.from({ length: MIN_CELL_SIZE }, () => ({ j: 'x' }));
    const below = Array.from({ length: MIN_CELL_SIZE - 1 }, () => ({ j: 'y' }));
    const { cells, suppressed } = aggregateWithPrivacy([...atFloor, ...below], ['j']);
    expect(cells.map((c) => c.j)).toEqual(['x']);
    expect(suppressed).toBe(1);
  });

  it('handles empty / malformed input safely (uncertainty -> silence)', () => {
    expect(aggregateWithPrivacy([], ['j'])).toEqual({ cells: [], suppressed: 0, total: 0 });
    expect(aggregateWithPrivacy(null, ['j']).cells).toEqual([]);
    expect(aggregateWithPrivacy([{ j: 'a' }], []).cells).toEqual([]); // no QI -> nothing
  });

  it('absent vs empty QI values collapse into one cell (no split-to-leak)', () => {
    const mixed = [
      ...Array.from({ length: 3 }, () => ({ j: 'a', d: null })),
      ...Array.from({ length: 3 }, () => ({ j: 'a', d: '' })),
    ];
    // 3 + 3 of a null-ish demographic must count as ONE cell of 6, not two of 3.
    const { cells } = aggregateWithPrivacy(mixed, ['j', 'd']);
    expect(cells).toHaveLength(1);
    expect(cells[0].n).toBe(6);
  });
});
