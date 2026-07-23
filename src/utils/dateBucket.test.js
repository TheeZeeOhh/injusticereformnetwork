import { describe, it, expect } from 'vitest';
import { isoWeekBucket } from './dateBucket';

// Dates are constructed in UTC (Date.UTC) to match the function's UTC contract.
// Ground-truth values are the ISO-8601 week (%G-W%V), independently confirmable
// via `date -u -d YYYY-MM-DD +%G-W%V`.
describe('isoWeekBucket — ISO-8601 week numbering', () => {
  it('handles plain mid-year dates', () => {
    expect(isoWeekBucket(new Date(Date.UTC(2026, 6, 23)))).toBe('2026-W30'); // Jul 23 2026
    expect(isoWeekBucket(new Date(Date.UTC(2026, 9, 15)))).toBe('2026-W42'); // Oct 15 2026
  });

  it('zero-pads single-digit week numbers', () => {
    expect(isoWeekBucket(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-W02'); // Jan 5 2026 (Mon)
  });

  // ── The boundary traps that break naive implementations ──
  it('2021-01-01 belongs to the PREVIOUS ISO year (2020-W53)', () => {
    expect(isoWeekBucket(new Date(Date.UTC(2021, 0, 1)))).toBe('2020-W53');
    expect(isoWeekBucket(new Date(Date.UTC(2020, 11, 28)))).toBe('2020-W53'); // Mon start of that week
  });

  it('2026-12-31 and 2027-01-01 fall in the SAME ISO week (2026-W53)', () => {
    expect(isoWeekBucket(new Date(Date.UTC(2026, 11, 31)))).toBe('2026-W53');
    expect(isoWeekBucket(new Date(Date.UTC(2027, 0, 1)))).toBe('2026-W53');
    expect(isoWeekBucket(new Date(Date.UTC(2027, 0, 3)))).toBe('2026-W53'); // Sunday of that week
  });

  it('handles the transition from 2026-W53 to 2027-W01', () => {
    expect(isoWeekBucket(new Date(Date.UTC(2027, 0, 3)))).toBe('2026-W53'); // Sun Jan 3 2027
    expect(isoWeekBucket(new Date(Date.UTC(2027, 0, 4)))).toBe('2027-W01'); // Mon Jan 4 2027
  });

  it('2020-12-31 is 2020-W53 (a 53-week year)', () => {
    expect(isoWeekBucket(new Date(Date.UTC(2020, 11, 31)))).toBe('2020-W53');
  });

  it('2019-12-30 (Monday) already belongs to 2020-W01', () => {
    expect(isoWeekBucket(new Date(Date.UTC(2019, 11, 30)))).toBe('2020-W01');
  });

  it('Jan 1 2020 (Wednesday) is 2020-W01', () => {
    expect(isoWeekBucket(new Date(Date.UTC(2020, 0, 1)))).toBe('2020-W01');
  });

  it('week 01 always contains January 4th (first-Thursday rule)', () => {
    expect(isoWeekBucket(new Date(Date.UTC(2026, 0, 4)))).toBe('2026-W01');
    expect(isoWeekBucket(new Date(Date.UTC(2023, 0, 4)))).toBe('2023-W01');
  });

  // ── Determinism: the reason this uses UTC internally ──
  it('is timezone-deterministic: same instant → same bucket regardless of local TZ', () => {
    // 2021-01-01T00:30:00Z sits in 2020-W53. A local-time implementation would
    // read this instant as Dec 31 under a negative UTC offset and could bucket it
    // differently. The UTC contract guarantees a single answer.
    const instant = new Date('2021-01-01T00:30:00.000Z');
    expect(isoWeekBucket(instant)).toBe('2020-W53');
  });

  it('rejects invalid input', () => {
    expect(() => isoWeekBucket('2026-07-23')).toThrow(TypeError);
    expect(() => isoWeekBucket(new Date('nonsense'))).toThrow(TypeError);
  });
});
