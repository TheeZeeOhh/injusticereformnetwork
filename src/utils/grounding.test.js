// grounding.test.js
//
// Unit + adversarial tests for the deterministic grounding gate. The point is
// red-team category (d): a CONFIDENT WRONG deadline/fee must be flagged from the
// actual answer text, not trusted to the system prompt. Every "confident wrong"
// case below is a real shape an OCR'd court notice / model answer produces.

import { describe, it, expect } from 'vitest';
import { ungroundedClaims, assertGrounded, extractClaims } from './grounding';

describe('grounding: core flag behavior', () => {
  it('flags a hallucinated deadline not in the source', () => {
    const source = 'The document lists a hearing on 2026-05-01 and a filing fee of $150.';
    const badAnswer = 'Your deadline is 2026-04-15 and the fee is $150.';
    const bad = ungroundedClaims(badAnswer, source);
    expect(bad).toContain('2026-04-15');
    expect(bad).not.toContain('$150');
  });

  it('flags a hallucinated fee amount', () => {
    const source = 'Filing fee: $150. Respond by 2026-05-01.';
    expect(ungroundedClaims('The fee is $500, due 2026-05-01.', source)).toContain('$500');
  });

  it('passes a fully grounded answer', () => {
    const source = 'Hearing 2026-05-01. Fee $150.';
    expect(ungroundedClaims('Your hearing is 2026-05-01 and the fee is $150.', source)).toEqual([]);
  });

  it('catches a confident answer with NO source facts at all', () => {
    const bad = ungroundedClaims('Your deadline is 2026-09-09.', 'The office is open Monday to Friday.');
    expect(bad).toContain('2026-09-09');
  });

  it('assertGrounded returns a structured verdict', () => {
    expect(assertGrounded('Fee $150.', 'Fee $150.')).toEqual({ grounded: true, violations: [] });
    const v = assertGrounded('Fee $500.', 'Fee $150.');
    expect(v.grounded).toBe(false);
    expect(v.violations).toContain('$500');
  });
});

describe('grounding: cross-format normalization (symmetry invariant)', () => {
  // A grounded fact phrased differently on each side must NOT flag.
  it('written-out answer date grounded by ISO source date', () => {
    expect(ungroundedClaims('Your hearing is May 1, 2026.', 'Hearing 2026-05-01.')).toEqual([]);
  });
  it('ISO answer date grounded by written-out source date', () => {
    expect(ungroundedClaims('Deadline 2026-05-01.', 'Respond by May 1st, 2026.')).toEqual([]);
  });
  it('US-slash answer grounded by ISO source', () => {
    expect(ungroundedClaims('Due 5/1/2026.', 'Due 2026-05-01.')).toEqual([]);
  });
  it('two-digit year normalizes to 20xx', () => {
    expect(ungroundedClaims('Due 05/01/26.', 'Due 2026-05-01.')).toEqual([]);
  });
  it('USD-word answer grounded by $ source', () => {
    expect(ungroundedClaims('The fee is USD 500.', 'Filing fee $500.')).toEqual([]);
  });
  it('"dollars"-word answer grounded by $ source', () => {
    expect(ungroundedClaims('It costs 500 dollars.', 'Fee: $500.')).toEqual([]);
  });
});

describe('grounding: adversarial / OCR shapes that must still be CAUGHT', () => {
  it('catches a written-out hallucinated date the old grabber missed', () => {
    // source has only May 1; answer invents June 3 in written form
    const bad = ungroundedClaims('Also respond by June 3, 2026.', 'Hearing May 1, 2026.');
    expect(bad).toContain('2026-06-03');
  });
  it('catches a USD-word hallucinated fee the old grabber missed', () => {
    expect(ungroundedClaims('The fee is USD 500.', 'Filing fee $150.')).toContain('$500');
  });
  it('catches a "dollars"-word hallucinated fee', () => {
    expect(ungroundedClaims('That will be 500 dollars.', 'Fee $150.')).toContain('$500');
  });
  it('OCR-spaced amount is read as its true value, not a truncated one', () => {
    // "$ 1 5 0" must normalize to $150 (grounded here), NOT "$1" (which would
    // false-flag as ungrounded). Guards the classic OCR-truncation bug.
    expect(extractClaims('$ 1 5 0')).toContain('$150');
    expect(ungroundedClaims('Fee $ 1 5 0.', 'Fee $150.')).toEqual([]);
  });
  it('OCR-spaced ISO date normalizes correctly', () => {
    expect(ungroundedClaims('Due 2026 - 05 - 01.', 'Due 2026-05-01.')).toEqual([]);
  });
  it('trailing sentence punctuation is not swallowed into the amount', () => {
    // "$500," -> "$500", so a grounded $500 does not false-flag
    expect(ungroundedClaims('The fee is $500, payable now.', 'Fee $500.')).toEqual([]);
  });
});
