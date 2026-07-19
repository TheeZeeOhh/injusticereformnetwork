import { describe, it, expect } from 'vitest';
import { summarizeReferrals, activeAgencies, validateAgency, validateReferral, REFERRAL_STATUSES } from './referrals';

describe('summarizeReferrals', () => {
  it('counts each status and zero-fills the rest', () => {
    const list = [
      { status: 'Sent' }, { status: 'Sent' }, { status: 'Completed' }, { status: 'bogus' },
    ];
    const s = summarizeReferrals(list);
    expect(s).toEqual({ Sent: 2, Accepted: 0, Completed: 1, Declined: 0 });
  });
  it('handles empty/non-array', () => {
    expect(summarizeReferrals(null)).toEqual({ Sent: 0, Accepted: 0, Completed: 0, Declined: 0 });
  });
});

describe('activeAgencies', () => {
  it('filters to Active only', () => {
    const ag = [
      { id: 'a', status: 'Active' },
      { id: 'b', status: 'Inactive' },
      { id: 'c', status: 'Active' },
    ];
    expect(activeAgencies(ag).map((a) => a.id)).toEqual(['a', 'c']);
  });
});

describe('validateAgency', () => {
  it('requires a name', () => {
    expect(validateAgency({ name: '' }).ok).toBe(false);
    expect(validateAgency({ name: '  ' }).ok).toBe(false);
    expect(validateAgency({ name: 'Housing Coalition' }).ok).toBe(true);
  });
});

describe('validateReferral', () => {
  it('requires a destination agency', () => {
    expect(validateReferral({ agencyId: '' }).ok).toBe(false);
    expect(validateReferral({ agencyId: 'agc_1' }).ok).toBe(true);
  });
  it('rejects an invalid status but accepts valid ones', () => {
    expect(validateReferral({ agencyId: 'agc_1', status: 'Nope' }).ok).toBe(false);
    for (const s of REFERRAL_STATUSES) {
      expect(validateReferral({ agencyId: 'agc_1', status: s }).ok).toBe(true);
    }
  });
});
