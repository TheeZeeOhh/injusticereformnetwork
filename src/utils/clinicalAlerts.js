// Pure rule logic for the dashboard Clinical Alerts panel. No I/O — the panel
// loads the encrypted records and passes them in, so these functions are
// deterministic and unit-testable with an injected `now`.

const DAY_MS = 24 * 60 * 60 * 1000;

// Appointment statuses that still "expect" the client to show. Completed,
// Cancelled, and No-show are resolved and never count as missed/upcoming.
const OPEN_STATUSES = new Set(['Scheduled', 'Confirmed']);

// A scheduled/confirmed appointment whose start time has already passed.
export function isMissed(appt, now) {
  if (!appt || !OPEN_STATUSES.has(appt.status)) return false;
  const t = new Date(appt.startTime).getTime();
  return Number.isFinite(t) && t < now.getTime();
}

// A scheduled/confirmed appointment starting within the next 24 hours.
export function isWithin24h(appt, now) {
  if (!appt || !OPEN_STATUSES.has(appt.status)) return false;
  const t = new Date(appt.startTime).getTime();
  if (!Number.isFinite(t)) return false;
  const nowMs = now.getTime();
  return t >= nowMs && t <= nowMs + DAY_MS;
}

// Whole days from `now` until `dateStr` (negative = overdue). Null if unparseable.
export function daysUntil(dateStr, now) {
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - now.getTime()) / DAY_MS);
}

// Split appointments into { missed, upcoming } alert lists.
export function computeApptAlerts(appointments, now) {
  const list = Array.isArray(appointments) ? appointments : [];
  const missed = [];
  const upcoming = [];
  for (const a of list) {
    if (isMissed(a, now)) missed.push({ patientId: a.patientId, startTime: a.startTime, kind: 'missed' });
    else if (isWithin24h(a, now)) upcoming.push({ patientId: a.patientId, startTime: a.startTime, kind: 'upcoming' });
  }
  return { missed, upcoming };
}

// HRT records due for a refill: refillWindow is overdue or within `windowDays`.
// `hrtRecords` is [{ ref, refillWindow }]; blank/unparseable windows are ignored.
export function computeHrtAlerts(hrtRecords, now, windowDays = 7) {
  const list = Array.isArray(hrtRecords) ? hrtRecords : [];
  const out = [];
  for (const r of list) {
    if (!r || !r.refillWindow) continue;
    const dueIn = daysUntil(r.refillWindow, now);
    if (dueIn === null) continue;
    if (dueIn <= windowDays) out.push({ ref: r.ref, refillWindow: r.refillWindow, dueIn });
  }
  // Most overdue first.
  return out.sort((a, b) => a.dueIn - b.dueIn);
}
