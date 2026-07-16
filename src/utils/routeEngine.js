// routeEngine.js
//
// Default-closed routing boundary for the hybrid assistant.
//
// The platform's privacy posture is local-first (technical-incapacity design).
// A hosted model (Anthropic/Claude, STANDARD tier — transient retention for
// abuse monitoring, not ZDR) is allowed ONLY for generic bureaucracy questions
// that carry no personal referent and are asked with no client record open.
//
// This module decides eligibility. It NEVER decides "send"; it only decides
// whether a message is even a candidate to leave the device. The rule is
// default-closed: anything not provably generic and referent-free stays LOCAL.
// Uncertainty resolves to 'local', every time.

// Personal-referent signals. Any hit forces 'local' regardless of topic — these
// are the phrases that mean a real person is attached to the question. Seeded
// from the assistant's own test corpus ("my client was evicted", etc.).
const REFERENT_PATTERNS = [
  /\bmy client\b/i,
  /\bthe client\b/i,
  /\bclient('s|s)?\b/i,
  /\bmy (patient|resident|case|guy|kid|son|daughter|partner|wife|husband)\b/i,
  /\b(he|she|they|him|her|them|his|hers|their|theirs)\b/i,
  /\bi (was|am|got|need|have been|'m|was just)\b/i,
  /\bmy (parole|probation|po|hearing|court date|case|charge|violation|custody|kid|hrt|hormones|meds|id|name change)\b/i,
  /\bfor me\b/i,
  // A bare capitalized given name mid-sentence (weak signal, still routes local).
  /\b[A-Z][a-z]+ (is|was|needs|has|got|will|can't|cannot)\b/
];

// Jurisdiction tokens. Jurisdiction alone is fine ("how do VA courts work"), but
// jurisdiction + a personal referent is a quasi-identifier — the referent check
// above already catches those. Kept for the quasi-identifier combination guard.
const JURISDICTION_PATTERNS = [
  /\b757\b/,
  /\bvirginia\b/i, /\bva\b/i,
  /\bmaryland\b/i, /\bmd\b/i,
  /\bbaltimore\b/i, /\bnorfolk\b/i, /\bhampton\b/i
];

// Narrow allowlist of GENERIC bureaucracy-decoding intents. A message must match
// one of these to even be eligible. This is intentionally small: "explain the
// concept", not "handle my situation".
const GENERIC_ALLOWLIST = [
  /^what (is|does|are|'s) (a |an |the )?[a-z0-9 '-]+\??$/i,
  /\bwhat does\b.*\bmean\b/i,
  /\bwhat('s| is) the difference between\b/i,
  /\bexplain (what |how )?(a |an |the )?[a-z0-9 '-]+\b/i,
  /\bhow (does|do) (a |an |the )?[a-z0-9 '-]+ (work|process|generally work)\b/i,
  /\bwhat (is|are) (a |an |the )?(continuance|arraignment|expungement|subpoena|deposition|indictment|misdemeanor|felony|probation|parole|foia)\b/i,
  /\bin general\b/i
];

// Personal / high-stakes topics that are NEVER generic even if phrased blandly.
// Belt-and-suspenders with the escalation ceiling; here they block eligibility.
const NEVER_GENERIC = [
  /\bcustody\b/i, /\bcps\b/i, /\bchild protective\b/i,
  /\bimmigration\b/i, /\bice\b/i, /\bdeport/i, /\bvisa\b/i, /\basylum\b/i,
  /\bmy violation\b/i, /\bviolation notice\b/i,
  /\bsuicid/i, /\bkill myself\b/i, /\bself.harm\b/i,
  /\bhormone|hrt|estrogen|testosterone|gender.affirming\b/i
];

/**
 * Decide whether a message is eligible to be sent to the hosted model.
 * Default-closed: returns 'local' unless every gate passes.
 *
 * @param {string} message - the navigator's raw input
 * @param {{clientRecordOpen?: boolean}} [ctx]
 * @returns {'local' | 'hosted'}
 */
export function classifyRoute(message, ctx = {}) {
  const text = String(message || '').trim();

  // Gate 0: no message, or a client record is open on screen -> local.
  if (!text) return 'local';
  if (ctx.clientRecordOpen) return 'local';

  // Gate 1: any personal referent -> local.
  if (REFERENT_PATTERNS.some((re) => re.test(text))) return 'local';

  // Gate 2: any never-generic topic -> local.
  if (NEVER_GENERIC.some((re) => re.test(text))) return 'local';

  // Gate 3: must affirmatively match the generic allowlist -> else local.
  if (!GENERIC_ALLOWLIST.some((re) => re.test(text))) return 'local';

  // Gate 4: quasi-identifier guard. Jurisdiction is OK alone, but if combined
  // with anything that survived to here AND the message is long/specific,
  // stay conservative. A short definitional question with a jurisdiction token
  // (e.g. "what is a continuance in VA") is allowed; a long specific one is not.
  const hasJurisdiction = JURISDICTION_PATTERNS.some((re) => re.test(text));
  if (hasJurisdiction && text.length > 80) return 'local';

  // All gates passed: a short, generic, referent-free definitional question.
  return 'hosted';
}
