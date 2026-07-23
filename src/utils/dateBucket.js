// HIPAA-safe coarse date bucketing.
//
// Exact service dates are a HIPAA Safe Harbor identifier (§164.514(b)(2)(i)(C)):
// dates more precise than year, tied to an individual, must be removed. A coarse
// ISO-8601 week bucket ("YYYY-Www") keeps enough signal for trend analysis while
// dropping the exact day.
//
// ISO-8601 week rules (the part naive implementations get wrong):
//   • Weeks start on MONDAY.
//   • Week 01 is the week containing the year's first THURSDAY — equivalently,
//     the week containing January 4th.
//   • The "week-numbering year" can differ from the calendar year at the
//     boundaries: 2021-01-01 is 2020-W53; 2026-12-31 and 2027-01-01 share a week.
//
// This is a pure function — no side effects, no dependencies. It operates in UTC
// (via getUTC* / Date.UTC) so the result is DETERMINISTIC regardless of the host
// machine's timezone. A local-time implementation would bucket the same instant
// into different weeks on a kiosk in one timezone versus a dev box in another —
// unacceptable for a de-identification primitive (verified: a 2021-01-01T00:30Z
// date reads as Dec 31 under a UTC-8 local build, shifting the day across a week
// boundary). UTC removes that class of drift entirely.

/**
 * Return the ISO-8601 week bucket for a date as "YYYY-Www".
 * @param {Date} date - any JS Date
 * @returns {string} e.g. "2026-W30"
 */
export function isoWeekBucket(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('isoWeekBucket requires a valid Date');
  }
  // Work on a UTC copy pinned to midnight so local time / DST can't shift the day.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  // ISO weekday: Mon=1 … Sun=7 (JS getUTCDay gives Sun=0 … Sat=6).
  const isoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay();

  // Shift to the THURSDAY of this week. The year of that Thursday IS the ISO
  // week-numbering year, and counting weeks to it yields the ISO week number.
  // (Thursday is day 4; move by 4 - isoDay days.)
  d.setUTCDate(d.getUTCDate() + 4 - isoDay);

  const isoYear = d.getUTCFullYear();

  // Week number = how many 7-day spans from Jan 1 of the ISO year to this Thursday.
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);

  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}
