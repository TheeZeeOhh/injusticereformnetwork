import { describe, it, expect } from 'vitest';
import { parse } from './parser.js';
import { validate } from './validate.js';

const check = (src) => validate(parse(src));
const messages = (r) => [...r.errors, ...r.warnings].map((x) => x.message).join(' | ');

describe('IRNL validator — structural errors', () => {
  it('rejects a typo\'d directive rather than ignoring it', () => {
    const r = check('policy aggregation { min_cell_sise 5 }');
    expect(r.errors.some((e) => /unknown policy directive/.test(e.message))).toBe(true);
  });

  it('rejects unknown field types', () => {
    expect(messages(check('entity E { id Blorp }'))).toMatch(/unknown type "Blorp"/);
  });

  it('rejects Ref to an undeclared entity', () => {
    expect(messages(check('entity E { c Ref(Missing) }'))).toMatch(/unknown entity "Missing"/);
  });

  it('rejects @aad bound to a field that does not exist', () => {
    expect(messages(check('entity E { body Ciphertext @aad(nope.id) }'))).toMatch(/no field "nope"/);
  });

  it('rejects a vault field naming an undeclared vault', () => {
    expect(messages(check('entity E { vault Enum(A, Z) }'))).toMatch(/undeclared vault/);
  });

  it('rejects duplicate declarations and duplicate fields', () => {
    expect(messages(check('policy p { a 1 }\npolicy p { a 1 }'))).toMatch(/duplicate policy "p"/);
    expect(messages(check('entity E { id Ulid\n id Ulid }'))).toMatch(/duplicate field "id"/);
  });

  it('requires parametric types to carry arguments', () => {
    expect(messages(check('entity E { k Enum }'))).toMatch(/needs arguments/);
  });
});

describe('IRNL validator — invariant warnings', () => {
  it('warns when the cell floor drops below 5', () => {
    const r = check('policy aggregation { min_cell_size 3 }');
    expect(r.errors).toEqual([]);
    expect(messages(r)).toMatch(/min_cell_size is 3/);
  });

  it('warns when vault B gains a recovery path', () => {
    expect(messages(check('vault B { recovery escrow }'))).toMatch(/unrecoverable by design/);
  });

  it('warns when small cells are rounded instead of suppressed', () => {
    expect(messages(check('policy aggregation { min_cell_size 5\n on_below_floor round }'))).toMatch(/not rounded/);
  });

  it('warns when PHI is typed as plaintext', () => {
    expect(messages(check('entity E { body Text @phi }'))).toMatch(/PHI must be Ciphertext/);
  });

  it('warns when the phi boundary fails to deny a network sink', () => {
    expect(messages(check('boundary phi { deny sink(cloud) }'))).toMatch(/does not deny sink "telemetry"/);
  });

  it('separates severities: a weakened invariant is a warning, a typo is an error', () => {
    const weak = check('policy aggregation { min_cell_size 1 }');
    expect(weak.errors).toHaveLength(0);
    expect(weak.warnings.length).toBeGreaterThan(0);
  });
});

describe('IRNL validator — duplicate settings (regression)', () => {
  // Found by adversarial testing: validate.js reads the FIRST occurrence of a
  // setting, compile.js's model keeps the LAST. A duplicate let a floor of 1
  // ship while `irnl check` reported zero weakened invariants.
  it('rejects a repeated single-valued setting instead of taking last-wins', () => {
    const r = check('policy aggregation { min_cell_size 5\n min_cell_size 1 }');
    expect(r.errors.some((e) => /duplicate "min_cell_size"/.test(e.message))).toBe(true);
  });

  it('names the line the setting was first established on', () => {
    const r = check('policy aggregation {\n min_cell_size 5\n min_cell_size 1\n}');
    expect(messages(r)).toMatch(/first set on line 2/);
  });

  it('still allows deny/allow/require/forbid to repeat and accumulate', () => {
    const r = check('boundary phi {\n deny sink(cloud)\n deny sink(p2p)\n allow sink(a)\n allow sink(b)\n}');
    expect(r.errors).toEqual([]);
  });

  it('catches duplicates in vaults too', () => {
    expect(messages(check('vault B { recovery none\n recovery escrow }'))).toMatch(/duplicate "recovery"/);
  });
});
