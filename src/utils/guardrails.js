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

import { minCellSize, declaredQuasiIdentifiers } from '../irnl/evaluate.js';

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

// --- Outbound SMS PHI guard ---------------------------------------------------
// send_sms_reminder relays the message body to Twilio (a third party). Reminders
// must be generic ("you have an upcoming appointment"); they must NOT carry PHI —
// a client name, case/docket number, DOB, health detail, or a personal referent.
// This is a deterministic content gate, ENFORCED IN CODE, so a caseworker can't
// accidentally disclose PHI to Twilio (which requires a BAA and is out of scope
// for PHI regardless). Default-closed on ambiguity: if it looks like PHI, block.
const SMS_PHI_PATTERNS = [
  // case / docket numbers, e.g. 2:26-cv-00104 or 24-CR-1234
  { rule: /\b(?:[0-9]{1,4}:)?[0-9]{2,4}-[a-z]{2,3}-[0-9]{3,6}\b/i, why: 'case/docket number' },
  { rule: /\b(?:case|docket)\s*#?\s*[a-z0-9-]+/i, why: 'case reference' },
  // dates of birth / DOB
  { rule: /\bdob\b|\bdate of birth\b|\bborn\b/i, why: 'date of birth' },
  // SSN-shaped
  { rule: /\b\d{3}-\d{2}-\d{4}\b/, why: 'SSN-shaped number' },
  // personal referents (a real person is attached)
  { rule: /\b(my|the|your) (client|patient|case)\b/i, why: 'personal referent' },
  // health / sensitive terms (42 CFR Part 2 / HRT / diagnosis)
  { rule: /\bhrt\b|\bhormone|\bestrogen|\btestosterone|\bdiagnos|\bmedication|\bprescription|\bhiv\b|\bmental health\b|\bsubstance\b/i, why: 'health/sensitive detail' },
  // a name-like "First Last" (weak, but PHI-cautious for a reminder)
  { rule: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/, why: 'possible client name' },
];

/**
 * Evaluate an outbound SMS body for PHI before it can leave the device via Twilio.
 * @param {string} body
 * @returns {{ blocked: boolean, why: string|null }}
 */
export function smsPhiCheck(body) {
  const text = String(body || '');
  const hit = SMS_PHI_PATTERNS.find((p) => p.rule.test(text));
  return hit ? { blocked: true, why: hit.why } : { blocked: false, why: null };
}

/**
 * True if this SMS body must be blocked from the outbound (Twilio) path.
 * @param {string} body
 * @returns {boolean}
 */
export function smsBlocksPhi(body) {
  return smsPhiCheck(body).blocked;
}

// --- Aggregate suppression (n < k) -------------------------------------------
// Any rollup/dashboard emission must suppress small cells, including
// quasi-identifier combinations (jurisdiction + demographic + timeframe).
// Below threshold: emit nothing (uncertainty resolves to silence).
//
// The floor is READ FROM IRNL, not written here. src/irnl/spec/irn.irn is the
// single declaration of it (`policy aggregation { min_cell_size 5 }`); this
// module is a consumer. Before that migration this file carried its own literal
// 5 and a conformance test compared the two — which caught divergence but still
// left two places to edit. There is now one.
//
// Resolved eagerly at import: a floor that can change after modules have read it
// is a floor that can be lowered mid-session. If the spec is malformed this
// throws at startup rather than running with unknown guardrails — fail loud, not
// open. `npm run irnl:check` and the test suite both gate that.
export const MIN_CELL_SIZE = minCellSize();

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

// --- Enforced aggregation gate (quasi-identifier combination k-anonymity) -----
//
// The single path any rollup/dashboard/grant statistic must use. It counts
// person-level rows grouped by the COMBINATION of quasi-identifiers (e.g.
// jurisdiction + demographic + timeframe), not a single column, and suppresses
// any combination below MIN_CELL_SIZE. This makes "n<k emits nothing" a property
// of the code path, not of whoever writes the query that week.
//
// Rationale (k-anonymity / ARX-style): a count of 1 for a quasi-identifier
// combination re-identifies that person even if no explicit identity column is
// present. The floor applies to the cross-tab, so we group on the tuple of QI
// values and drop under-threshold groups entirely (suppression, not rounding).

/**
 * Read the quasi-identifier tuple for a row as a stable string key.
 * Missing QI values are normalized so absent-vs-empty can't split a cell.
 * @param {Record<string, unknown>} row
 * @param {string[]} quasiIdentifiers
 * @returns {string}
 */
function qiKey(row, quasiIdentifiers) {
  return quasiIdentifiers
    .map((k) => {
      const v = row == null ? undefined : row[k];
      return `${k}=${v == null || v === '' ? '\u0000' : String(v)}`;
    })
    .join('|');
}

/**
 * Aggregate person-level rows into privacy-safe counts.
 *
 * Groups rows by the COMBINATION of `quasiIdentifiers`, counts each group, and
 * emits ONLY groups whose count >= MIN_CELL_SIZE. Under-threshold combinations
 * are suppressed entirely (uncertainty -> silence), so quasi-identifier linkage
 * cannot re-identify an individual.
 *
 * @param {Array<Record<string, unknown>>} rows      person-level input rows
 * @param {string[]} [quasiIdentifiers]  columns forming the QI tuple. OMIT to use
 *   the set IRNL declares (@quasi_identifier in src/irnl/spec/irn.irn); pass an
 *   explicit [] to emit nothing. Omitting also fails closed if the rows carry
 *   none of the declared columns.
 * @returns {{ cells: Array<Record<string, unknown> & { n: number }>, suppressed: number, total: number }}
 *   cells: emittable aggregates (each carries its QI values + `n`);
 *   suppressed: number of groups dropped for being below the floor;
 *   total: number of input rows considered.
 */
export function aggregateWithPrivacy(rows, quasiIdentifiers) {
  if (!Array.isArray(rows)) return { cells: [], suppressed: 0, total: 0 };

  // OMITTED (undefined) -> fall back to the quasi-identifiers IRNL declares.
  // Forgetting the argument used to return silence, which is safe but invisible:
  // a dashboard just renders empty and nobody learns the gate was misused. The
  // declared set is the strictest correct grouping, so supplying it is not a
  // loosening — the k-anonymity property is unchanged, only the columns are
  // filled in.
  //
  // An EXPLICIT [] still returns nothing. "I deliberately passed no
  // quasi-identifiers" and "I forgot the argument" are different statements and
  // must not collapse into one.
  let qis = quasiIdentifiers;
  if (qis === undefined) {
    qis = declaredQuasiIdentifiers();
    // Guard against grouping rows that carry none of the declared columns: every
    // row would key to all-nulls, collapse into a single bucket, clear the floor
    // and emit one meaningless total. Not a privacy leak, but a confidently
    // wrong number is its own hazard. Fail closed instead.
    if (!rows.some((row) => row != null && typeof row === 'object' && qis.some((k) => k in row))) {
      return { cells: [], suppressed: 0, total: 0 };
    }
  }

  if (!Array.isArray(qis) || qis.length === 0) {
    return { cells: [], suppressed: 0, total: 0 };
  }
  const quasiIdentifiersResolved = qis;
  const groups = new Map();
  for (const row of rows) {
    if (row == null || typeof row !== 'object') continue;
    const key = qiKey(row, quasiIdentifiersResolved);
    let g = groups.get(key);
    if (!g) {
      g = { n: 0 };
      for (const k of quasiIdentifiersResolved) g[k] = row[k] ?? null;
      groups.set(key, g);
    }
    g.n += 1;
  }
  const all = [...groups.values()];
  const cells = all.filter((g) => cellEmittable(g.n));
  return { cells, suppressed: all.length - cells.length, total: rows.length };
}
