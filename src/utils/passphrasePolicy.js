// passphrasePolicy.js
//
// Passphrase strength policy (finding H3). The entire "technical incapacity
// defense" rests on passphrase entropy — the KDF only matters if the passphrase
// is strong — so we enforce a real floor, not just a length check.
//
// Uses zxcvbn for entropy estimation: it catches dictionary words, keyboard
// walks, l33t substitutions, dates, and repeats that a naive length/complexity
// rule misses. This is a pure module (no UI, no crypto) so it is fully
// unit-testable and reusable at every enrollment point.
import zxcvbn from 'zxcvbn';

// Policy thresholds.
//   MIN_LENGTH: a hard floor independent of zxcvbn (short strings can score
//     deceptively well on tiny dictionaries).
//   MIN_SCORE:  zxcvbn score is 0-4. 3 = "safely unguessable: moderate
//     protection from an offline slow-hash scenario", which is the relevant
//     threat here (a seized vault brute-forced offline). We require >= 3.
export const MIN_LENGTH = 12;
export const MIN_SCORE = 3;

// Context terms that must NOT contribute entropy (product/brand words and any
// operator-provided identifiers). zxcvbn penalizes these when passed as inputs.
const BASE_CONTEXT = ['sanctuary', 'vault', 'vaultb', 'irn', 'navigator', 'ehr'];

const SCORE_LABEL = ['very weak', 'weak', 'fair', 'strong', 'very strong'];

/**
 * Evaluate a passphrase against the policy.
 *
 * @param {string} passphrase
 * @param {object} [opts]
 * @param {string[]} [opts.userInputs] extra context terms (e.g. operator name)
 *   that should not count as strength.
 * @returns {{
 *   score: number,            // zxcvbn 0-4
 *   label: string,            // human label for the score
 *   acceptable: boolean,      // passes the policy?
 *   reason: string|null,      // why it was rejected (null if acceptable)
 *   warning: string,          // zxcvbn feedback.warning ('' if none)
 *   suggestions: string[]     // zxcvbn feedback.suggestions
 * }}
 */
export function evaluatePassphrase(passphrase, opts = {}) {
  const pass = typeof passphrase === 'string' ? passphrase : '';
  const userInputs = [
    ...BASE_CONTEXT,
    ...(Array.isArray(opts.userInputs) ? opts.userInputs : [])
  ].filter(Boolean);

  const result = zxcvbn(pass, userInputs);
  const score = result.score;
  const label = SCORE_LABEL[score] || 'unknown';
  const warning = result.feedback?.warning || '';
  const suggestions = result.feedback?.suggestions || [];

  let reason = null;
  if (pass.length < MIN_LENGTH) {
    reason = `Passphrase must be at least ${MIN_LENGTH} characters.`;
  } else if (score < MIN_SCORE) {
    reason =
      warning ||
      'Passphrase is too easy to guess. Use a longer, more unpredictable phrase.';
  }

  return {
    score,
    label,
    acceptable: reason === null,
    reason,
    warning,
    suggestions
  };
}

/**
 * Convenience guard used by the auth flows: returns null if acceptable, else the
 * rejection reason string. Keeps call sites terse.
 */
export function passphraseRejectionReason(passphrase, opts) {
  return evaluatePassphrase(passphrase, opts).reason;
}
