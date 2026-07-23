import { describe, it, expect } from 'vitest';
import { HiveMindEngine, admissionGate, HIVE_MIN_SOURCES } from './hiveEngine';

// The hive-mind is a replicated CRDT store: once a record syncs it lives on every
// node forever, unrecallable. The admission gate enforces the invariant that
// NOTHING person-identifying (or below the source floor) enters it. These tests
// prove the gate holds — the single highest-risk guarantee in the app.

const VEC = new Array(768).fill(0.1);
const ok = (over = {}) => ({ sourceText: 'Baltimore City Circuit Court filing fee is $165, verified.', ...over });

describe('admissionGate — subpoena litmus (reject person-identifying)', () => {
  it('ACCEPTS public bureaucratic ground truth', () => {
    expect(admissionGate(ok()).ok).toBe(true);
    expect(admissionGate({ sourceText: 'Form CC-DR-020 is rejected if block 7 is blank.' }).ok).toBe(true);
    expect(admissionGate({ sourceText: 'Norfolk clerk office responds within 3 business days on average.' }).ok).toBe(true);
  });

  it('REJECTS a client / casework referent', () => {
    expect(admissionGate({ sourceText: 'my client needs a continuance' }).ok).toBe(false);
    expect(admissionGate({ sourceText: 'navigator note: the client was evicted' }).ok).toBe(false);
  });
  it('REJECTS singular personal pronouns (an individual is attached)', () => {
    expect(admissionGate({ sourceText: 'her hearing went badly' }).ok).toBe(false);
    expect(admissionGate({ sourceText: 'his case was dismissed' }).ok).toBe(false);
  });
  // HONEST LIMIT: a bare person name in otherwise-public text cannot be reliably
  // distinguished from a place name (Circuit Court, Norfolk) by regex. The gate
  // catches names when paired with any person-signal (pronoun, "client",
  // date, health, case ref). A lone name relies on the taxonomy rule that only
  // public ground truth is submitted — documented as a residual caller
  // responsibility, not a silent false claim of protection.
  it('REJECTS a name when paired with a person-signal', () => {
    expect(admissionGate({ sourceText: 'John Smith, my client, filed late' }).ok).toBe(false);
    expect(admissionGate({ sourceText: 'saw Jane about her hearing' }).ok).toBe(false);
  });
  it('REJECTS individual scheduling / dates', () => {
    expect(admissionGate({ sourceText: 'court date 03/15/2026' }).ok).toBe(false);
    expect(admissionGate({ sourceText: 'appointment is next Tuesday' }).ok).toBe(false);
  });
  it('REJECTS DOB / SSN / health detail', () => {
    expect(admissionGate({ sourceText: 'DOB on file' }).ok).toBe(false);
    expect(admissionGate({ sourceText: 'SSN 123-45-6789' }).ok).toBe(false);
    expect(admissionGate({ sourceText: 'started hormone therapy' }).ok).toBe(false);
  });
  it('REJECTS case/docket references', () => {
    expect(admissionGate({ sourceText: 'docket number pending' }).ok).toBe(false);
  });
  it('REJECTS empty candidates (uncertainty -> silence)', () => {
    expect(admissionGate({ sourceText: '' }).ok).toBe(false);
    expect(admissionGate({}).ok).toBe(false);
  });
});

describe('admissionGate — n>=k source floor for pattern entries', () => {
  it('REJECTS a pattern entry below the source floor', () => {
    const r = admissionGate({ sourceText: 'clerks in region often reject block 7', isPattern: true, sourceCount: HIVE_MIN_SOURCES - 1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/source floor/);
  });
  it('ACCEPTS a pattern entry at/above the source floor', () => {
    expect(admissionGate({ sourceText: 'clerks in region often reject block 7', isPattern: true, sourceCount: HIVE_MIN_SOURCES }).ok).toBe(true);
  });
  it('non-pattern ground truth is not subject to the source floor', () => {
    expect(admissionGate({ sourceText: 'filing fee is $165', isPattern: false }).ok).toBe(true);
  });
});

describe('admissionGate — authorship must be role/region, never identity', () => {
  it('ACCEPTS role/region tokens', () => {
    expect(admissionGate(ok({ lastVerifiedBy: 'Baltimore navigator' })).ok).toBe(true);
    expect(admissionGate(ok({ lastVerifiedBy: '757 intake' })).ok).toBe(true);
    expect(admissionGate(ok({ lastVerifiedBy: 'Norfolk clerk office' })).ok).toBe(true);
  });
  it('REJECTS a person/device identity as authorship', () => {
    const r = admissionGate(ok({ lastVerifiedBy: 'device-a1b2c3' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/role\/region/);
  });
});

describe('HiveMindEngine.insert — gate is ENFORCED, not advisory', () => {
  it('THROWS and stores nothing when the candidate is person-identifying', async () => {
    const h = new HiveMindEngine();
    await expect(h.insert('k1', VEC, 1, { sourceText: 'my client John Smith' })).rejects.toThrow(/admission REJECTED/i);
    expect(h.flatten()).toHaveLength(0); // nothing entered the store
  });
  it('THROWS when no candidate metadata is supplied (default-closed)', async () => {
    const h = new HiveMindEngine();
    await expect(h.insert('k1', VEC, 1)).rejects.toThrow(/admission REJECTED/i);
    expect(h.flatten()).toHaveLength(0);
  });
  it('ACCEPTS and stores admissible public ground truth', async () => {
    const h = new HiveMindEngine();
    await h.insert('fee_baltimore', VEC, 1, ok());
    expect(h.flatten()).toHaveLength(1);
    expect(h.flatten()[0].key).toBe('fee_baltimore');
  });
  it('THROWS on a below-floor pattern entry (no single reporter recoverable)', async () => {
    const h = new HiveMindEngine();
    await expect(
      h.insert('pat1', VEC, 1, { sourceText: 'clerks reject block 7', isPattern: true, sourceCount: 2 })
    ).rejects.toThrow(/source floor/);
    expect(h.flatten()).toHaveLength(0);
  });
});
