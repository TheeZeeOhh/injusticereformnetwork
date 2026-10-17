// conformance.test.js — the test that makes IRNL load-bearing.
//
// Everything else in src/irnl/ is a language. THIS file is the reason the
// language exists: it asserts that the code actually shipping to clients agrees
// with src/irnl/spec/irn.irn. If someone lowers MIN_CELL_SIZE in guardrails.js,
// or adds a recovery path to vault B, or lets the PHI boundary reach a network
// sink, this test fails and the commit gate blocks it.
//
// That is the governance rule from CLAUDE.md expressed as code: weakening an
// invariant is possible, but only by deliberately editing a test — never by
// quietly editing a value.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from './compile.js';
import { CANONICAL_SOURCE, loadSpec } from './spec.js';
import {
  minCellSize, cellEmittable, quasiIdentifiersOf, sinkAllowed,
  declaredDenominations, denominationOf, conversionAllowed,
  forbiddenIdentityFields, isForbiddenIdentityField
} from './evaluate.js';
import * as guardrails from '../utils/guardrails.js';

const program = loadSpec();

describe('IRNL conformance — the spec itself', () => {
  it('compiles with zero errors', () => {
    const { errors } = compile(CANONICAL_SOURCE, { strict: false });
    expect(errors).toEqual([]);
  });

  it('compiles with zero warnings — no invariant is weakened', () => {
    // A warning here means an IRN guardrail has been loosened. Do not silence
    // this by deleting the assertion; change the spec back, or get Aziza's
    // sign-off and change this test deliberately.
    const { warnings } = compile(CANONICAL_SOURCE, { strict: false });
    expect(warnings).toEqual([]);
  });
});

describe('IRNL conformance — guardrails.js agrees with the spec', () => {
  // NOTE: guardrails.js now READS its floor from IRNL, so comparing the two
  // would be a tautology — it could never fail, while still looking like a
  // test. Pin the value to an independent literal instead. This is what keeps
  // the audit trail: changing the floor in the spec breaks this assertion (and
  // guardrails.test.js), so it cannot happen without a deliberate test edit.
  it('the declared floor is 5, and guardrails ships that floor', () => {
    expect(minCellSize(program)).toBe(5);
    expect(guardrails.MIN_CELL_SIZE).toBe(5);
  });

  it('guardrails takes its floor from the spec, not a second literal', () => {
    // A regression guard for the migration itself: if someone re-hardcodes the
    // constant, the spec stops being the single source and this stops holding.
    const source = readFileSync(resolve(import.meta.dirname, '../utils/guardrails.js'), 'utf8');
    expect(source).toMatch(/MIN_CELL_SIZE = minCellSize\(\)/);
    expect(source).not.toMatch(/MIN_CELL_SIZE = \d/);
  });

  it('cellEmittable agrees with the spec across the boundary', () => {
    for (let n = 0; n <= 12; n += 1) {
      expect(guardrails.cellEmittable(n)).toBe(cellEmittable(n, program));
    }
  });

  it('suppressSmallCells drops exactly the cells the spec forbids', () => {
    const rows = [{ n: 1 }, { n: 4 }, { n: 5 }, { n: 99 }];
    const kept = guardrails.suppressSmallCells(rows);
    expect(kept).toEqual(rows.filter((r) => cellEmittable(r.n, program)));
    expect(kept.map((r) => r.n)).toEqual([5, 99]);
  });

  it('aggregateWithPrivacy suppresses on the declared quasi-identifier tuple', () => {
    const qis = quasiIdentifiersOf('Client', program);
    expect(qis.length).toBeGreaterThan(1); // the combination, not one column

    // Five people sharing a QI tuple clear the floor; a lone sixth does not.
    const rows = [
      ...Array.from({ length: 5 }, () => ({ jurisdiction: '757', demographic: 'trans', timeframe: 'w1' })),
      { jurisdiction: '757', demographic: 'trans', timeframe: 'w2' }
    ];
    const { cells, suppressed } = guardrails.aggregateWithPrivacy(rows, qis);
    expect(cells).toHaveLength(1);
    expect(cells[0].n).toBe(5);
    expect(suppressed).toBe(1);
    // The cell of 1 must be absent entirely — suppressed, not rounded.
    expect(cells.some((c) => c.n < guardrails.MIN_CELL_SIZE)).toBe(false);
  });
});

describe('IRNL conformance — declared boundaries hold', () => {
  it('no PHI sink reaches the network', () => {
    for (const sink of ['cloud', 'p2p', 'telemetry', 'sms', 'analytics']) {
      expect(sinkAllowed('phi', sink, {}, program)).toBe(false);
    }
  });

  it('key material has no path to disk, logs, state or backups', () => {
    for (const sink of ['disk', 'log', 'state', 'backup']) {
      expect(sinkAllowed('keys', sink, {}, program)).toBe(false);
    }
  });

  it('vault B remains unrecoverable and closed by default', () => {
    expect(program.vaults.B.recovery).toBe('none');
    expect(program.vaults.B.opens).toBe('explicit_only');
  });

  it('the outbound SMS policy denies PHI, and guardrails enforces it', () => {
    expect(program.policies.outbound_sms.deny).toContain('phi');
    // A body carrying a client name / health detail must be blocked in code.
    expect(guardrails.smsBlocksPhi('Reminder for Jane Doe re: her HRT refill')).toBe(true);
    expect(guardrails.smsBlocksPhi('You have an upcoming appointment.')).toBe(false);
  });
});

describe('IRNL conformance — the gate actually bites', () => {
  it('a lowered floor in the spec produces a warning, not silence', () => {
    const weakened = CANONICAL_SOURCE.replace('min_cell_size    5', 'min_cell_size    2');
    const { warnings } = compile(weakened, { strict: false });
    expect(warnings.some((w) => /min_cell_size is 2/.test(w.message))).toBe(true);
  });

  it('a recovery path added to vault B produces a warning', () => {
    const weakened = CANONICAL_SOURCE.replace('recovery   none', 'recovery   escrow');
    const { warnings } = compile(weakened, { strict: false });
    expect(warnings.some((w) => /vault B recovery/.test(w.message))).toBe(true);
  });

  it('a PHI boundary opened to the cloud produces a warning', () => {
    const weakened = CANONICAL_SOURCE.replace(
      'allow  sink(local_disk) when encrypted',
      'allow  sink(cloud)'
    );
    const { warnings } = compile(weakened, { strict: false });
    expect(warnings.some((w) => /allows network sink "cloud"/.test(w.message))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Commons scope wall
//
// Two ledgers, two denominations, and a wall between them that is the whole
// compliance position: hours are mutual credit (not purchasable, not
// redeemable), aid is money IRN already holds. If the wall falls the rail is a
// money services business, and CIP identity collection becomes the floor for
// every feature — including handing someone $200 in an emergency.
//
// The spec half is asserted below by mutating CANONICAL_SOURCE. The code half
// is asserted against commons.html, which is the Commons that actually ships
// today: a standalone page with no module system, so it is checked
// structurally at the source rather than by importing it.
// ---------------------------------------------------------------------------

const COMMONS_PATH = resolve(import.meta.dirname, '../../commons.html');
const commonsSource = readFileSync(COMMONS_PATH, 'utf8');
// Everything after <script> — the CSS above it has its own `prop: value` shapes
// that would otherwise read as object keys.
const commonsScript = commonsSource.slice(commonsSource.indexOf('<script>'));

/** Body of a top-level `function name(...)`, brace-matched. */
function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

/** Every non-nested object literal in the source, as raw text. */
const objectLiterals = (source) => source.match(/\{[^{}]*\}/g) ?? [];

/** Keys declared in an object literal's text. */
const keysOf = (literal) => [...literal.matchAll(/(?:^|[{,]\s*)([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1]);

describe('IRNL conformance — the Commons scope wall is declared', () => {
  it('declares both denominations and forbids conversion in both directions', () => {
    expect(declaredDenominations(program).sort()).toEqual(['dollars', 'hours']);
    expect(conversionAllowed('hours', 'dollars', program)).toBe(false);
    expect(conversionAllowed('dollars', 'hours', program)).toBe(false);
    // A move within one denomination is the only permitted move.
    expect(conversionAllowed('hours', 'hours', program)).toBe(true);
    expect(conversionAllowed('dollars', 'dollars', program)).toBe(true);
    // An undeclared unit is denied rather than assumed harmless.
    expect(conversionAllowed('hours', 'bitcoin', program)).toBe(false);
    expect(conversionAllowed('points', 'points', program)).toBe(false);
  });

  it('binds each ledger field to exactly one denomination', () => {
    expect(denominationOf('HourEntry', 'units', program)).toBe('hours');
    expect(denominationOf('AidGrant', 'amount', program)).toBe('dollars');
    expect(denominationOf('Participant', 'handle', program)).toBeNull();
  });

  it('no entity carries two denominations — a record holding both IS a conversion', () => {
    for (const entity of Object.values(program.entities)) {
      const units = new Set(entity.fields.map((f) => f.denomination).filter(Boolean));
      expect(units.size, `${entity.name} mixes denominations`).toBeLessThan(2);
    }
  });

  it('forbids the CIP four and their aliases, and no entity declares one', () => {
    const forbidden = forbiddenIdentityFields(program);
    // 31 CFR 1020.220: name, date of birth, address, identification number.
    for (const required of ['legal_name', 'address', 'date_of_birth', 'ssn', 'government_id']) {
      expect(forbidden).toContain(required);
    }
    for (const entity of Object.values(program.entities)) {
      for (const f of entity.fields) {
        expect(
          isForbiddenIdentityField(f.name, program),
          `${entity.name}.${f.name} is a KYC identity field`
        ).toBe(false);
      }
    }
  });

  it('matches an identity field regardless of spelling style', () => {
    expect(isForbiddenIdentityField('dateOfBirth', program)).toBe(true);
    expect(isForbiddenIdentityField('date_of_birth', program)).toBe(true);
    expect(isForbiddenIdentityField('SSN', program)).toBe(true);
    expect(isForbiddenIdentityField('handle', program)).toBe(false);
    expect(isForbiddenIdentityField('circle', program)).toBe(false);
  });
});

describe('IRNL conformance — the Commons scope wall bites', () => {
  it('a KYC field on any entity produces a warning', () => {
    const weakened = CANONICAL_SOURCE.replace('  circle  Text', '  circle  Text\n  date_of_birth Text');
    const { warnings } = compile(weakened, { strict: false });
    expect(warnings.some((w) => /Participant\.date_of_birth is a KYC identity field/.test(w.message))).toBe(true);
  });

  it('a KYC field spelled in camelCase produces the same warning', () => {
    const weakened = CANONICAL_SOURCE.replace('  circle  Text', '  circle  Text\n  dateOfBirth Text');
    const { warnings } = compile(weakened, { strict: false });
    expect(warnings.some((w) => /dateOfBirth is a KYC identity field/.test(w.message))).toBe(true);
  });

  it('a KYC field on a Sanctuary entity warns too — the rule is IRN-wide', () => {
    const weakened = CANONICAL_SOURCE.replace('  alias         Text    @pii', '  alias         Text    @pii\n  ssn           Text');
    const { warnings } = compile(weakened, { strict: false });
    expect(warnings.some((w) => /Client\.ssn is a KYC identity field/.test(w.message))).toBe(true);
  });

  it('making hours redeemable — a dollar figure on an hours record — warns', () => {
    const weakened = CANONICAL_SOURCE.replace(
      '  memo      Text  @pii',
      '  memo      Text  @pii\n  cash_value Int  @denominated(dollars)'
    );
    const { warnings } = compile(weakened, { strict: false });
    expect(warnings.some((w) => /HourEntry carries 2 denominations/.test(w.message))).toBe(true);
  });

  it('dropping either direction of the conversion ban warns', () => {
    for (const [line, pair] of [
      ['  forbid  convert(hours, dollars)\n', 'convert\\(hours, dollars\\)'],
      ['  forbid  convert(dollars, hours)\n', 'convert\\(dollars, hours\\)']
    ]) {
      const { warnings } = compile(CANONICAL_SOURCE.replace(line, ''), { strict: false });
      expect(warnings.some((w) => new RegExp(`does not forbid ${pair}`).test(w.message))).toBe(true);
    }
  });

  it('deleting the policy outright warns rather than passing quietly', () => {
    const weakened = CANONICAL_SOURCE.replace(/policy commons_scope \{[\s\S]*?\n\}/, '');
    const { warnings } = compile(weakened, { strict: false });
    expect(warnings.some((w) => /no commons_scope policy declared/.test(w.message))).toBe(true);
  });

  it('a typo in @denominated is an error, not a silently-skipped field', () => {
    // The failure this guards: `@denominatd(hours)` leaves `units` outside the
    // conversion check while the file still reads as if it were covered.
    const typo = CANONICAL_SOURCE.replace('@denominated(hours)', '@denominatd(hours)');
    const { errors } = compile(typo, { strict: false });
    expect(errors.some((e) => /unknown annotation @denominatd/.test(e.message))).toBe(true);
  });

  it('an undeclared denomination is an error', () => {
    const bogus = CANONICAL_SOURCE.replace('@denominated(hours)', '@denominated(bitcoin)');
    const { errors } = compile(bogus, { strict: false });
    expect(errors.some((e) => /names a unit no policy declares/.test(e.message))).toBe(true);
  });
});

describe('IRNL conformance — commons.html holds the wall', () => {
  it('the participant record carries a handle and a circle, and no identity', () => {
    // Three construction sites today: the roster form, quick-add, and the sample
    // ledger. The key-set assertion is the guard — a fourth site is fine, a site
    // that grows a KYC field is not. The count floor only proves the regex is
    // still matching real code rather than quietly matching nothing.
    const literals = commonsScript.match(/\{\s*id:\s*uid\(\),\s*handle:[^}]*\}/g) ?? [];
    expect(literals.length).toBeGreaterThanOrEqual(3);
    for (const lit of literals) {
      expect(keysOf(lit).sort(), lit).toEqual(['handle', 'id', 'joined', 'tag']);
    }
  });

  it('no record anywhere in the page carries an identity field', () => {
    const offenders = [];
    for (const lit of objectLiterals(commonsScript)) {
      for (const key of keysOf(lit)) {
        if (isForbiddenIdentityField(key, program)) offenders.push(key);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no record carries an hours figure and a dollars figure at once', () => {
    // `units` is hundredths of an hour, `amount` is cents. A row holding both is
    // where a conversion rate would have to live.
    const mixed = objectLiterals(commonsScript)
      .filter((lit) => {
        const keys = keysOf(lit);
        return keys.includes('units') && keys.includes('amount');
      });
    expect(mixed).toEqual([]);
  });

  it('the hours ledger is computed only from hours entries', () => {
    const body = functionBody(commonsScript, 'balances');
    expect(body).toBeTruthy();
    expect(body).toContain('state.hours');
    // Reading the fund from the hours balance is what redemption would look like.
    for (const store of ['state.deposits', 'state.payouts', 'state.requests']) {
      expect(body, `balances() reads ${store}`).not.toContain(store);
    }
  });

  it('the aid fund is computed only from deposits and payouts', () => {
    const body = functionBody(commonsScript, 'fundBalance');
    expect(body).toBeTruthy();
    expect(body).toContain('state.deposits');
    expect(body).toContain('state.payouts');
    expect(body, 'fundBalance() reads the hours ledger').not.toContain('state.hours');
  });
});
