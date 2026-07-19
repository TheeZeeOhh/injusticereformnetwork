// Pure logic for the Credential Monitoring module. No I/O — the page loads/saves
// the encrypted list and passes it in, so these are deterministic and testable
// with an injected `now`.

export const CREDENTIAL_TYPES = ['License', 'Certification', 'Background Check', 'CEU/Training', 'Other'];

const URGENT_DAYS = 30;
const SOON_DAYS = 60;

// Whole days from `now` until `expiryDate` (negative = expired). Null if the
// date is blank or unparseable.
export function daysUntil(expiryDate, now) {
  if (!expiryDate) return null;
  const t = new Date(expiryDate).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - now.getTime()) / (24 * 60 * 60 * 1000));
}

// Classify a credential by its expiry:
//   'unknown' (no/blank/bad expiry) | 'expired' | 'urgent' (<=30d) |
//   'soon' (<=60d) | 'valid' (>60d).
export function credentialStatus(cred, now) {
  const d = daysUntil(cred?.expiryDate, now);
  if (d === null) return 'unknown';
  if (d < 0) return 'expired';
  if (d <= URGENT_DAYS) return 'urgent';
  if (d <= SOON_DAYS) return 'soon';
  return 'valid';
}

// Count credentials in each status bucket.
export function summarizeCredentials(list, now) {
  const arr = Array.isArray(list) ? list : [];
  const out = { expired: 0, urgent: 0, soon: 0, valid: 0, unknown: 0 };
  for (const c of arr) out[credentialStatus(c, now)] += 1;
  return out;
}

// Validate an add-form entry. staffName + credentialType required; expiryDate,
// if provided, must parse. A blank expiry is allowed (status becomes 'unknown').
export function validateCredential({ staffName, credentialType, expiryDate } = {}) {
  if (!staffName || !String(staffName).trim()) {
    return { ok: false, error: 'Staff name is required.' };
  }
  if (!credentialType || !CREDENTIAL_TYPES.includes(credentialType)) {
    return { ok: false, error: 'Select a credential type.' };
  }
  if (expiryDate && !Number.isFinite(new Date(expiryDate).getTime())) {
    return { ok: false, error: 'Expiry date is invalid.' };
  }
  return { ok: true, error: null };
}
