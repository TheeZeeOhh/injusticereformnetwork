// guardrails.js
//
// Deterministic safety gates that wrap the assistant. These are ENFORCED IN
// CODE, not left to the model's prompt-following. A persona prompt that *asks*
// a model to handle crises is not a crisis path; this module is.
//
// Order of precedence (highest first), all evaluated before any routing:
//   1. Crisis        -> force crisis-resource response, NEVER route hosted.
//   2. Escalation    -> force navigator-handoff response, NEVER route hosted.
// Only if neither fires does normal routing/answering proceed.

// --- Crisis detection ---------------------------------------------------------
// Read generously, per the platform's crisis posture: err toward treating
// ambiguous distress as crisis. False positives here cost a gentle extra
// message; false negatives cost a life.
const CRISIS_PATTERNS = [
  /\bsuicid/i,
  /\bkill (myself|me)\b/i,
  /\bend (it|my life)\b/i,
  /\b(hurt|harm)(ing)? myself\b/i,
  /\bself.?harm\b/i,
  /\bwant to die\b/i,
  /\bdon'?t want to (be here|live|go on)\b/i,
  /\bcan'?t do this anymore\b/i,
  /\bno reason to (live|go on)\b/i,
  /\bin danger\b/i,
  /\b(he|she|they|someone)('s| is| are)? going to (hurt|kill|beat)\b/i,
  /\bnowhere to (sleep|go)\b/i,
  /\bnot safe (tonight|right now)\b/i,
  /\boverdos/i
];

// --- Escalation ceiling -------------------------------------------------------
// Situations where a wrong answer is worse than a slow one. These go to a human
// IRN navigator. Not routine check-ins — allegations, active legal process,
// status overlaps, order interpretation.
const ESCALATION_PATTERNS = [
  { rule: /\bcps\b|\bchild protective\b|\bcustody\b|\bfoster\b/i, why: 'child custody / CPS involvement' },
  { rule: /\bimmigration\b|\bice\b|\bdeport|\bvisa\b|\basylum\b|\bgreen card\b/i, why: 'immigration status overlap' },
  { rule: /\b(my|a) (lawyer|attorney)\b|\bactive (case|litigation)\b|\bpending lawsuit\b/i, why: 'active litigation / attorney already involved' },
  { rule: /\bviolation (notice|allegation|charge)\b|\baccused of violating\b|\brevocation\b/i, why: 'parole/probation violation allegation' },
  { rule: /\bcourt order (says|means|requires)\b|\binterpret (the|this) order\b|\bwhat does (my|the) (court order|order|ruling) mean\b/i, why: 'interpreting a court order (not a form)' }
];

/**
 * @typedef {Object} GuardResult
 * @property {'crisis'|'escalate'|null} kind
 * @property {string} [why]  human-readable reason (escalation only)
 */

/**
 * Evaluate a message against the deterministic gates.
 * Returns { kind: 'crisis' } , { kind: 'escalate', why } , or { kind: null }.
 * @param {string} message
 * @returns {GuardResult}
 */
export function checkGuardrails(message) {
  const text = String(message || '');
  if (CRISIS_PATTERNS.some((re) => re.test(text))) {
    return { kind: 'crisis' };
  }
  const esc = ESCALATION_PATTERNS.find((e) => e.rule.test(text));
  if (esc) {
    return { kind: 'escalate', why: esc.why };
  }
  return { kind: null };
}

/**
 * True when the message must be blocked from any hosted/outbound path.
 * Crisis and escalation both hard-block hosted routing.
 * @param {string} message
 * @returns {boolean}
 */
export function blocksHosted(message) {
  return checkGuardrails(message).kind !== null;
}

// --- Aggregate suppression (n < k) -------------------------------------------
// Any rollup/dashboard emission must suppress small cells, including
// quasi-identifier combinations (jurisdiction + demographic + timeframe).
// Below threshold: emit nothing (uncertainty resolves to silence).
export const MIN_CELL_SIZE = 5;

/**
 * Returns true if an aggregate cell of size `n` is safe to emit.
 * @param {number} n
 * @returns {boolean}
 */
export function cellEmittable(n) {
  return Number.isFinite(n) && n >= MIN_CELL_SIZE;
}

/**
 * Filters an array of aggregate rows, dropping any whose count is below the
 * minimum cell size. Each row must expose its count via `countKey` (default 'n').
 * @template T
 * @param {T[]} rows
 * @param {string} [countKey]
 * @returns {T[]}
 */
export function suppressSmallCells(rows, countKey = 'n') {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => cellEmittable(row?.[countKey]));
}
