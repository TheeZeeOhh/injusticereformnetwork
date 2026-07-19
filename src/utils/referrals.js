// Pure logic for the Inter-Agency Referral module. No I/O — the page loads/saves
// the encrypted lists and passes them in, so these are unit-testable.

export const REFERRAL_STATUSES = ['Sent', 'Accepted', 'Completed', 'Declined'];
export const AGENCY_STATUSES = ['Active', 'Inactive'];

// Count referrals in each status bucket.
export function summarizeReferrals(list) {
  const arr = Array.isArray(list) ? list : [];
  const out = {};
  for (const s of REFERRAL_STATUSES) out[s] = 0;
  for (const r of arr) {
    if (r && REFERRAL_STATUSES.includes(r.status)) out[r.status] += 1;
  }
  return out;
}

// Agencies eligible as a referral destination (Active only).
export function activeAgencies(agencies) {
  const arr = Array.isArray(agencies) ? agencies : [];
  return arr.filter((a) => a && a.status === 'Active');
}

// Validate a partner-agency entry — name required.
export function validateAgency({ name } = {}) {
  if (!name || !String(name).trim()) return { ok: false, error: 'Agency name is required.' };
  return { ok: true, error: null };
}

// Validate a new referral — a destination agency and a valid status are required.
export function validateReferral({ agencyId, status } = {}) {
  if (!agencyId) return { ok: false, error: 'Select a destination agency.' };
  if (status && !REFERRAL_STATUSES.includes(status)) return { ok: false, error: 'Invalid referral status.' };
  return { ok: true, error: null };
}
