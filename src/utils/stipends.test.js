import { describe, it, expect } from 'vitest';
import { stipendTotal, summarizeByType, validateStipend, STIPEND_TYPES } from './stipends';

describe('stipendTotal', () => {
  it('sums numeric amounts, ignoring blanks and non-numbers', () => {
    const list = [
      { amount: 25 }, { amount: '10.50' }, { amount: '' }, { amount: 'x' }, {},
    ];
    expect(stipendTotal(list)).toBeCloseTo(35.5);
  });
  it('returns 0 for empty/non-array', () => {
    expect(stipendTotal([])).toBe(0);
    expect(stipendTotal(null)).toBe(0);
  });
});

describe('summarizeByType', () => {
  it('groups counts and totals by type', () => {
    const list = [
      { type: 'Transit', amount: 10 },
      { type: 'Transit', amount: 5 },
      { type: 'Gift Card', amount: 25 },
      { type: 'Food', amount: '' }, // counts, no total
    ];
    const s = summarizeByType(list);
    expect(s.Transit).toEqual({ count: 2, total: 15 });
    expect(s['Gift Card']).toEqual({ count: 1, total: 25 });
    expect(s.Food).toEqual({ count: 1, total: 0 });
  });
});

describe('validateStipend', () => {
  it('requires a valid type', () => {
    expect(validateStipend({ type: '' }).ok).toBe(false);
    expect(validateStipend({ type: 'Nonsense' }).ok).toBe(false);
  });
  it('accepts a valid type with no amount (non-cash incentive)', () => {
    expect(validateStipend({ type: 'Food', amount: '' }).ok).toBe(true);
  });
  it('accepts a valid non-negative amount', () => {
    expect(validateStipend({ type: 'Cash', amount: '20' }).ok).toBe(true);
    expect(validateStipend({ type: 'Cash', amount: 0 }).ok).toBe(true);
  });
  it('rejects a negative or non-numeric amount', () => {
    expect(validateStipend({ type: 'Cash', amount: '-5' }).ok).toBe(false);
    expect(validateStipend({ type: 'Cash', amount: 'abc' }).ok).toBe(false);
  });
  it('every STIPEND_TYPE validates', () => {
    for (const t of STIPEND_TYPES) expect(validateStipend({ type: t }).ok).toBe(true);
  });
});
