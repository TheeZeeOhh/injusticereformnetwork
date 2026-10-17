// commonsScope.js — the wall between the Commons' two rails.
//
// The Commons keeps two ledgers that must never become one:
//
//   hours    mutual credit. A record of what the commons owes you. They cannot
//            be bought with dollars and cannot be redeemed for dollars.
//   dollars  aid IRN disburses from money IT ALREADY HOLDS. Charitable
//            grantmaking, which moves nobody else's money.
//
// Keeping them apart is not a product preference, it is the compliance
// position. A ledger that never touches money is not money transmission —
// and FinCEN sets no activity threshold for transmitters, so the first
// converted hour is the one that matters. If the wall falls, the rail becomes a
// money services business: BSA/AML program, SARs, five-year retention, and
// customer identification (31 CFR 1020.220 — name, date of birth, address,
// identification number) for everyone. That is the exact inverse of Technical
// Incapacity, and it lands hardest on people whose documents do not match who
// they are, at the same chokepoint Cash App and Venmo already use to freeze
// accounts.
//
// So this module enforces two things, and reads both from IRNL rather than
// restating them:
//
//   1. No value crosses denominations.
//   2. No record carries a KYC identity field.
//
// The declarations live in `policy commons_scope` in src/irnl/spec/irn.irn.
// Weakening them is a spec edit plus a deliberate test edit — see CLAUDE.md.
//
// NOT LEGAL ADVICE, and not a substitute for counsel. It is the engineering
// half: the app cannot do the thing whether or not anyone remembers why.

import {
  declaredDenominations,
  forbiddenIdentityFields,
  conversionAllowed as specConversionAllowed,
  isForbiddenIdentityField
} from '../irnl/evaluate.js';

/**
 * Field names IRN must never collect, as declared by IRNL.
 * @type {readonly string[]}
 */
export const FORBIDDEN_IDENTITY_FIELDS = Object.freeze(forbiddenIdentityFields());

/**
 * Units of account IRNL declares.
 * @type {readonly string[]}
 */
export const DENOMINATIONS = Object.freeze(declaredDenominations());

// Resolved eagerly at import, and fatal when empty — the same posture
// guardrails.js takes with MIN_CELL_SIZE. An empty forbidden list does not mean
// "nothing is forbidden", it means the boundary is unknown, and a module that
// starts up against an unknown boundary is a module that silently permits
// everything it was written to refuse. Fail loud, not open. `npm run irnl:check`
// and the test suite both gate this before it can reach a build.
if (FORBIDDEN_IDENTITY_FIELDS.length === 0) {
  throw new Error(
    'commonsScope: IRNL declares no forbidden identity fields ' +
    '(policy commons_scope, forbid identity_field). Refusing to run with an unknown KYC boundary.'
  );
}
if (DENOMINATIONS.length === 0) {
  throw new Error(
    'commonsScope: IRNL declares no denominations (policy commons_scope, denominations). ' +
    'Refusing to run without knowing which units may not be converted.'
  );
}

/** Thrown when a write would breach the scope wall. Distinct so callers can catch it. */
export class CommonsScopeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CommonsScopeError';
  }
}

/**
 * Every KYC-shaped key in a record, reported under the name the caller used.
 *
 * Walks nested objects and arrays: a `government_id` one level down is the same
 * collection as one at the top, and an intake form that nests its fields must
 * not be a way around the check. Cycles are visited once.
 *
 * @param {unknown} record
 * @returns {string[]} dotted paths of offending keys, e.g. ['profile.dob']
 */
export function identityFieldsIn(record) {
  const found = [];
  const seen = new WeakSet();

  const walk = (node, path) => {
    if (node === null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    for (const key of Object.keys(node)) {
      const here = path ? `${path}.${key}` : key;
      if (isForbiddenIdentityField(key)) found.push(here);
      walk(node[key], here);
    }
  };

  walk(record, '');
  return found;
}

/**
 * Refuse a record that carries KYC identity. Call this on the write path, not
 * the read path — the point is that the data never lands.
 *
 * @param {unknown} record
 * @param {string} [what] label for the error message, e.g. 'participant'
 * @returns {unknown} the record, so this can wrap a call site
 * @throws {CommonsScopeError}
 */
export function assertNoIdentityFields(record, what = 'record') {
  const offending = identityFieldsIn(record);
  if (offending.length) {
    throw new CommonsScopeError(
      `${what} carries identity field(s) IRN does not collect: ${offending.join(', ')}. ` +
      'See policy commons_scope in src/irnl/spec/irn.irn.'
    );
  }
  return record;
}

/**
 * Whether value may move from `from` to `to`.
 *
 * True only within a single declared denomination. Cross-denomination is what
 * makes hours purchasable or redeemable; an unknown unit is denied too.
 *
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function conversionAllowed(from, to) {
  return specConversionAllowed(from, to);
}

/**
 * Refuse a cross-denomination move.
 *
 * @param {string} from
 * @param {string} to
 * @param {string} [what] label for the error message, e.g. 'redeem hours'
 * @throws {CommonsScopeError}
 */
export function assertSameDenomination(from, to, what = 'transfer') {
  if (conversionAllowed(from, to)) return;
  throw new CommonsScopeError(
    `${what}: ${String(from)} to ${String(to)} is not a permitted move. ` +
    'Hours are mutual credit and dollars are IRN\'s own funds; neither converts into the other. ' +
    'See policy commons_scope in src/irnl/spec/irn.irn.'
  );
}
