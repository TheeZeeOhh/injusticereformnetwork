// commonsScope.test.js — the wall between hours and dollars, and the KYC
// fields neither rail collects.
//
// These are unit tests for the enforcement module. The question "does the
// SPEC still declare the wall" lives in src/irnl/conformance.test.js; the
// question here is "does the code refuse the write".

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FORBIDDEN_IDENTITY_FIELDS,
  DENOMINATIONS,
  CommonsScopeError,
  identityFieldsIn,
  assertNoIdentityFields,
  conversionAllowed,
  assertSameDenomination
} from './commonsScope.js';
import { forbiddenIdentityFields, declaredDenominations } from '../irnl/evaluate.js';

describe('commonsScope reads the boundary from IRNL', () => {
  it('takes its forbidden fields and denominations from the spec, not a local list', () => {
    expect([...FORBIDDEN_IDENTITY_FIELDS]).toEqual(forbiddenIdentityFields());
    expect([...DENOMINATIONS].sort()).toEqual(declaredDenominations().sort());
  });

  it('exposes them frozen — a boundary must not be editable at runtime', () => {
    expect(Object.isFrozen(FORBIDDEN_IDENTITY_FIELDS)).toBe(true);
    expect(Object.isFrozen(DENOMINATIONS)).toBe(true);
  });

  it('covers the CIP four (31 CFR 1020.220)', () => {
    for (const field of ['legal_name', 'address', 'date_of_birth', 'ssn']) {
      expect(FORBIDDEN_IDENTITY_FIELDS).toContain(field);
    }
  });
});

describe('conversionAllowed — hours are neither purchasable nor redeemable', () => {
  it('refuses both directions across denominations', () => {
    expect(conversionAllowed('hours', 'dollars')).toBe(false);
    expect(conversionAllowed('dollars', 'hours')).toBe(false);
  });

  it('permits a move within one denomination', () => {
    expect(conversionAllowed('hours', 'hours')).toBe(true);
    expect(conversionAllowed('dollars', 'dollars')).toBe(true);
  });

  it('denies unknown units rather than assuming them harmless', () => {
    expect(conversionAllowed('hours', 'credits')).toBe(false);
    expect(conversionAllowed('credits', 'credits')).toBe(false);
    expect(conversionAllowed(undefined, undefined)).toBe(false);
    expect(conversionAllowed(null, 'hours')).toBe(false);
    expect(conversionAllowed('', '')).toBe(false);
  });

  it('assertSameDenomination throws on a redemption and names the policy', () => {
    expect(() => assertSameDenomination('hours', 'dollars', 'redeem hours')).toThrow(CommonsScopeError);
    expect(() => assertSameDenomination('hours', 'dollars', 'redeem hours')).toThrow(/commons_scope/);
    expect(() => assertSameDenomination('dollars', 'hours', 'buy hours')).toThrow(CommonsScopeError);
  });

  it('assertSameDenomination passes a same-denomination move through silently', () => {
    expect(() => assertSameDenomination('hours', 'hours')).not.toThrow();
    expect(() => assertSameDenomination('dollars', 'dollars')).not.toThrow();
  });
});

describe('identityFieldsIn — what the Commons must never collect', () => {
  it('passes a real participant record', () => {
    expect(identityFieldsIn({ id: 'a1', handle: 'river', tag: '757', joined: 0 })).toEqual([]);
  });

  it('catches each CIP field', () => {
    expect(identityFieldsIn({ handle: 'river', legal_name: 'x' })).toEqual(['legal_name']);
    expect(identityFieldsIn({ handle: 'river', address: 'x' })).toEqual(['address']);
    expect(identityFieldsIn({ handle: 'river', date_of_birth: 'x' })).toEqual(['date_of_birth']);
    expect(identityFieldsIn({ handle: 'river', ssn: 'x' })).toEqual(['ssn']);
  });

  it('catches a field regardless of spelling style', () => {
    expect(identityFieldsIn({ dateOfBirth: 'x' })).toEqual(['dateOfBirth']);
    expect(identityFieldsIn({ DOB: 'x' })).toEqual(['DOB']);
    expect(identityFieldsIn({ driversLicense: 'x' })).toEqual(['driversLicense']);
  });

  it('reaches into nested objects — one level down is the same collection', () => {
    expect(identityFieldsIn({ handle: 'river', profile: { dob: '1990-01-01' } })).toEqual(['profile.dob']);
  });

  it('reaches into arrays', () => {
    const record = { handle: 'river', documents: [{ passport_number: 'X' }] };
    expect(identityFieldsIn(record)).toEqual(['documents[0].passport_number']);
  });

  it('reports every offender, not just the first', () => {
    const found = identityFieldsIn({ legal_name: 'a', address: 'b', ssn: 'c' });
    expect(found.sort()).toEqual(['address', 'legal_name', 'ssn']);
  });

  it('survives a cycle', () => {
    const record = { handle: 'river' };
    record.self = record;
    expect(() => identityFieldsIn(record)).not.toThrow();
    expect(identityFieldsIn(record)).toEqual([]);
  });

  it('handles non-objects without throwing', () => {
    for (const value of [null, undefined, 0, '', 'handle', true, []]) {
      expect(identityFieldsIn(value)).toEqual([]);
    }
  });
});

describe('assertNoIdentityFields — the write path refuses', () => {
  it('throws on a KYC field and names it', () => {
    expect(() => assertNoIdentityFields({ handle: 'river', ssn: '000' }, 'participant'))
      .toThrow(CommonsScopeError);
    expect(() => assertNoIdentityFields({ handle: 'river', ssn: '000' }, 'participant'))
      .toThrow(/participant carries identity field\(s\).*ssn/);
  });

  it('returns the record when clean, so it can wrap a call site', () => {
    const record = { id: 'a1', handle: 'river', tag: '757', joined: 0 };
    expect(assertNoIdentityFields(record, 'participant')).toBe(record);
  });

  it('refuses an intake form that nests its identity fields', () => {
    expect(() => assertNoIdentityFields({ handle: 'river', kyc: { government_id: 'X' } }))
      .toThrow(/kyc\.government_id/);
  });
});

describe('commonsScope fails closed on an unknown boundary', () => {
  // The claim this module makes is that an EMPTY forbidden list is treated as
  // "the boundary is unknown", not "nothing is forbidden". Untested, that is
  // just a comment — so drive the module against a spec that declares nothing
  // and confirm it refuses to load at all.
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../irnl/evaluate.js');
    vi.resetModules();
  });

  it('refuses to import when no identity fields are declared', async () => {
    vi.doMock('../irnl/evaluate.js', async (importOriginal) => ({
      ...(await importOriginal()),
      forbiddenIdentityFields: () => []
    }));
    await expect(import('./commonsScope.js')).rejects.toThrow(/unknown KYC boundary/);
  });

  it('refuses to import when no denominations are declared', async () => {
    vi.doMock('../irnl/evaluate.js', async (importOriginal) => ({
      ...(await importOriginal()),
      declaredDenominations: () => []
    }));
    await expect(import('./commonsScope.js')).rejects.toThrow(/which units may not be converted/);
  });

  it('loads normally against the real spec — the guard is not always-on', async () => {
    const mod = await import('./commonsScope.js');
    expect(mod.FORBIDDEN_IDENTITY_FIELDS.length).toBeGreaterThan(0);
    expect(mod.DENOMINATIONS.length).toBe(2);
  });
});
