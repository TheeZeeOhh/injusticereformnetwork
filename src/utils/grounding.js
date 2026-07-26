// grounding.js
//
// Deterministic grounding gate (LLM-safety red-team category (d): "confident
// wrong deadline/fee"). Given a model ANSWER and the SOURCE FACTS the answer is
// supposed to be grounded in, flag any date or money amount the answer asserts
// that is NOT present in the source.
//
// This is the load-bearing complement to the WIFEY_SYSTEM instruction "never
// state a deadline/fee". Do not trust the system prompt to hold under adversarial
// pressure: this layer checks the ACTUAL output, model-free, so it cannot itself
// be prompt-injected. A non-empty result means the answer invented a
// deadline/fee and must not be presented as fact.
//
// Symmetry invariant: the answer and the source are normalized through the SAME
// extractor. A fact only counts as "grounded" if its normalized form appears in
// the normalized source — so a legitimately-sourced date phrased differently
// ("May 1, 2026" vs "2026-05-01") is compared on canonical form, and a written
// date present in the source never false-flags.

const MONTHS = {
  january: '01', february: '02', march: '03', april: '04', may: '05',
  june: '06', july: '07', august: '08', september: '09', october: '10',
  november: '11', december: '12',
};

// Canonicalize a year/month/day into ISO YYYY-MM-DD (zero-padded).
function iso(y, m, d) {
  const yy = String(y).length === 2 ? `20${y}` : String(y).padStart(4, '20');
  return `${yy}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Extract normalized DATE tokens (all canonicalized to ISO) from text.
// Handles: ISO (2026-05-01), US slash (5/1/2026 or 05/01/26), and written-out
// "Month D, YYYY" / "Month Dth YYYY". OCR spacing around ISO dashes tolerated.
function extractDates(text) {
  const s = String(text || '');
  const out = new Set();

  // ISO, tolerating OCR spaces around the dashes: 2026 - 05 - 01
  for (const m of s.matchAll(/\b(\d{4})\s*-\s*(\d{2})\s*-\s*(\d{2})\b/g)) {
    out.add(iso(m[1], m[2], m[3]));
  }
  // US slash M/D/Y or MM/DD/YY(YY)
  for (const m of s.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g)) {
    out.add(iso(m[3], m[1], m[2]));
  }
  // Written-out "Month D[st|nd|rd|th], YYYY"
  const monthRe = new RegExp(
    '\\b(' + Object.keys(MONTHS).join('|') + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b',
    'gi',
  );
  for (const m of s.matchAll(monthRe)) {
    out.add(iso(m[3], MONTHS[m[1].toLowerCase()], m[2]));
  }
  return out;
}

// Extract normalized MONEY tokens (canonical "$N" with no thousands separators,
// cents preserved) from text. Handles: $150, $1,234.56, "USD 500", "500 dollars",
// and OCR-spaced digits "$ 1 5 0".
function extractMoney(text) {
  const s = String(text || '');
  const out = new Set();
  const norm = (digits) => `$${String(digits).replace(/[,\s]/g, '')}`;

  // $ 1,234.56  /  $150  /  $ 1 5 0  (OCR spacing). Require at least one digit.
  for (const m of s.matchAll(/\$\s*([\d][\d,.\s]*\d|\d)/g)) {
    const cleaned = m[1].replace(/\s/g, '');
    // strip a trailing punctuation-comma/period that is not cents (e.g. "$500,")
    const trimmed = cleaned.replace(/[.,]$/, '');
    out.add(norm(trimmed));
  }
  // USD 500  /  USD500
  for (const m of s.matchAll(/\bUSD\s*([\d,]+(?:\.\d{2})?)\b/gi)) {
    out.add(norm(m[1]));
  }
  // 500 dollars
  for (const m of s.matchAll(/\b([\d,]+(?:\.\d{2})?)\s*dollars?\b/gi)) {
    out.add(norm(m[1]));
  }
  return out;
}

/**
 * Normalized set of all grounded-claim tokens (dates + amounts) in a text.
 * @param {string} text
 * @returns {Set<string>}
 */
export function extractClaims(text) {
  return new Set([...extractDates(text), ...extractMoney(text)]);
}

/**
 * Dates/amounts asserted in `answer` that do NOT appear in `sourceFacts`,
 * compared on canonical (normalized) form. Non-empty => ungrounded answer.
 * @param {string} answer
 * @param {string} sourceFacts
 * @returns {string[]} canonical tokens present in answer but absent from source
 */
export function ungroundedClaims(answer, sourceFacts) {
  const src = extractClaims(sourceFacts);
  return [...extractClaims(answer)].filter((claim) => !src.has(claim));
}

/**
 * Grounding verdict for a live answer.
 * @param {string} answer
 * @param {string} sourceFacts
 * @returns {{ grounded: boolean, violations: string[] }}
 */
export function assertGrounded(answer, sourceFacts) {
  const violations = ungroundedClaims(answer, sourceFacts);
  return { grounded: violations.length === 0, violations };
}
