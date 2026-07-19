import { describe, it, expect } from 'vitest';
import { daysUntil, credentialStatus, summarizeCredentials, validateCredential, CREDENTIAL_TYPES } from './credentials';

const NOW = new Date('2026-07-19T12:00:00Z');
const daysFromNow = (d) => new Date(NOW.getTime() + d * 86400 * 1000).toISOString().slice(0, 10);

describe('daysUntil', () => {
  it('is positive for future, negative for past', () => {
    expect(daysUntil(daysFromNow(10), NOW)).toBeGreaterThan(0);
    expect(daysUntil(daysFromNow(-5), NOW)).toBeLessThan(0);
  });
  it('is null for blank/junk', () => {
    expect(daysUntil('', NOW)).toBeNull();
    expect(daysUntil('nope', NOW)).toBeNull();
  });
});

describe('credentialStatus', () => {
  it('classifies each bucket', () => {
    expect(credentialStatus({ expiryDate: daysFromNow(-1) }, NOW)).toBe('expired');
    expect(credentialStatus({ expiryDate: daysFromNow(20) }, NOW)).toBe('urgent');
    expect(credentialStatus({ expiryDate: daysFromNow(45) }, NOW)).toBe('soon');
    expect(credentialStatus({ expiryDate: daysFromNow(90) }, NOW)).toBe('valid');
    expect(credentialStatus({ expiryDate: '' }, NOW)).toBe('unknown');
  });
  it('treats exactly 30 days as urgent and 60 as soon', () => {
    expect(credentialStatus({ expiryDate: daysFromNow(30) }, NOW)).toBe('urgent');
    expect(credentialStatus({ expiryDate: daysFromNow(60) }, NOW)).toBe('soon');
  });
});

describe('summarizeCredentials', () => {
  it('tallies each status', () => {
    const list = [
      { expiryDate: daysFromNow(-1) },  // expired
      { expiryDate: daysFromNow(10) },  // urgent
      { expiryDate: daysFromNow(50) },  // soon
      { expiryDate: daysFromNow(200) }, // valid
      { expiryDate: '' },               // unknown
    ];
    expect(summarizeCredentials(list, NOW)).toEqual({ expired: 1, urgent: 1, soon: 1, valid: 1, unknown: 1 });
  });
});

describe('validateCredential', () => {
  it('requires staff name and a valid type', () => {
    expect(validateCredential({ staffName: '', credentialType: 'License' }).ok).toBe(false);
    expect(validateCredential({ staffName: 'Jo', credentialType: 'Nope' }).ok).toBe(false);
  });
  it('accepts a valid entry, and a blank expiry', () => {
    expect(validateCredential({ staffName: 'Jo', credentialType: 'License', expiryDate: daysFromNow(30) }).ok).toBe(true);
    expect(validateCredential({ staffName: 'Jo', credentialType: 'License', expiryDate: '' }).ok).toBe(true);
  });
  it('rejects an unparseable expiry', () => {
    expect(validateCredential({ staffName: 'Jo', credentialType: 'License', expiryDate: 'xyz' }).ok).toBe(false);
  });
  it('every CREDENTIAL_TYPE validates', () => {
    for (const t of CREDENTIAL_TYPES) expect(validateCredential({ staffName: 'Jo', credentialType: t }).ok).toBe(true);
  });
});
