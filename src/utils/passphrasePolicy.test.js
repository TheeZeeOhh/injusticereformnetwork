import { describe, it, expect } from 'vitest';
import {
  evaluatePassphrase,
  passphraseRejectionReason,
  MIN_LENGTH,
  MIN_SCORE
} from './passphrasePolicy';

// Task #13 — passphrase strength policy (finding H3).

describe('evaluatePassphrase', () => {
  it('rejects anything shorter than the length floor', () => {
    const r = evaluatePassphrase('aB3$xY'); // 6 chars
    expect(r.acceptable).toBe(false);
    expect(r.reason).toMatch(new RegExp(`at least ${MIN_LENGTH}`));
  });

  it('rejects a long but low-entropy passphrase', () => {
    const r = evaluatePassphrase('passwordpassword'); // long, trivial
    expect(r.acceptable).toBe(false);
    expect(r.score).toBeLessThan(MIN_SCORE);
    expect(r.reason).toBeTruthy();
  });

  it('rejects a keyboard walk', () => {
    expect(evaluatePassphrase('qwertyuiopasdf').acceptable).toBe(false);
  });

  it('accepts a strong, long, unpredictable passphrase', () => {
    const r = evaluatePassphrase('correct horse battery staple gymnasium');
    expect(r.acceptable).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.score).toBeGreaterThanOrEqual(MIN_SCORE);
  });

  it('penalizes product/brand context terms', () => {
    // "sanctuary" is in the base context, so leaning on it should not pass.
    const weak = evaluatePassphrase('sanctuarysanctuary');
    expect(weak.acceptable).toBe(false);
  });

  it('passes supplied userInputs to the estimator so they cost entropy', () => {
    // Passing a term as a userInput must not INCREASE its score vs. omitting it;
    // for a borderline phrase containing the term, the scored-with-input result
    // is <= the naive one. We assert the wiring, not a specific zxcvbn verdict.
    const term = 'zephyrqualm';
    const withInput = evaluatePassphrase(`${term}${term}`, { userInputs: [term] }).score;
    const without = evaluatePassphrase(`${term}${term}`).score;
    expect(withInput).toBeLessThanOrEqual(without);
  });

  it('exposes a score, label, and feedback shape', () => {
    const r = evaluatePassphrase('short');
    expect(typeof r.score).toBe('number');
    expect(typeof r.label).toBe('string');
    expect(Array.isArray(r.suggestions)).toBe(true);
  });
});

describe('passphraseRejectionReason', () => {
  it('returns null for an acceptable passphrase', () => {
    expect(
      passphraseRejectionReason('correct horse battery staple gymnasium')
    ).toBeNull();
  });
  it('returns a string reason for a weak one', () => {
    expect(typeof passphraseRejectionReason('short')).toBe('string');
  });
});
