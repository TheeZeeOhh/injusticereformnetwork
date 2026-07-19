// Pure helpers for the per-client stipend/incentive tracker. No I/O — the page
// loads/saves the encrypted list and passes it in, so these are unit-testable.

export const STIPEND_TYPES = ['Gift Card', 'Transit', 'Cash', 'Food', 'Other'];

// Parse a stipend amount into a non-negative number, or null if blank/invalid.
function parseAmount(amount) {
  if (amount === '' || amount === null || amount === undefined) return null;
  const n = Number(amount);
  return Number.isFinite(n) ? n : null;
}

// Sum of numeric amounts; blanks and non-numbers are ignored.
export function stipendTotal(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr.reduce((sum, s) => {
    const n = parseAmount(s?.amount);
    return sum + (n && n > 0 ? n : (n === 0 ? 0 : (Number.isFinite(n) ? n : 0)));
  }, 0);
}

// { type: { count, total } } for a summary strip.
export function summarizeByType(list) {
  const arr = Array.isArray(list) ? list : [];
  const out = {};
  for (const s of arr) {
    const type = s?.type || 'Other';
    if (!out[type]) out[type] = { count: 0, total: 0 };
    out[type].count += 1;
    const n = parseAmount(s?.amount);
    if (Number.isFinite(n)) out[type].total += n;
  }
  return out;
}

// Validate an add-form entry. Type is required; amount, if provided, must be a
// non-negative number (blank is allowed — non-cash incentives have no amount).
export function validateStipend({ type, amount } = {}) {
  if (!type || !STIPEND_TYPES.includes(type)) {
    return { ok: false, error: 'Select a stipend type.' };
  }
  if (amount !== '' && amount !== null && amount !== undefined) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: 'Amount must be a non-negative number.' };
    }
  }
  return { ok: true, error: null };
}
