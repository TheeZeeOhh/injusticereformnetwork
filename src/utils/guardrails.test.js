import { describe, it, expect } from 'vitest';
import {
  checkGuardrails,
  blocksHosted,
  cellEmittable,
  suppressSmallCells,
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
