import { describe, it, expect } from 'vitest';
import { computeApptAlerts, computeHrtAlerts, isMissed, isWithin24h, daysUntil } from './clinicalAlerts';

// Fixed reference time for deterministic tests.
const NOW = new Date('2026-07-19T12:00:00Z');
const hoursFromNow = (h) => new Date(NOW.getTime() + h * 3600 * 1000).toISOString();
const daysFromNowStr = (d) => new Date(NOW.getTime() + d * 86400 * 1000).toISOString().slice(0, 10);

describe('appointment alerts', () => {
  it('flags a past Scheduled appt as missed', () => {
    expect(isMissed({ status: 'Scheduled', startTime: hoursFromNow(-2) }, NOW)).toBe(true);
  });
  it('does not flag past Completed/Cancelled/No-show as missed', () => {
    for (const status of ['Completed', 'Cancelled', 'No-show']) {
      expect(isMissed({ status, startTime: hoursFromNow(-2) }, NOW)).toBe(false);
    }
  });
  it('does not flag a future appt as missed', () => {
    expect(isMissed({ status: 'Scheduled', startTime: hoursFromNow(5) }, NOW)).toBe(false);
  });

  it('flags an appt within 24h as upcoming', () => {
    expect(isWithin24h({ status: 'Confirmed', startTime: hoursFromNow(2) }, NOW)).toBe(true);
  });
  it('does not flag an appt 25h out', () => {
    expect(isWithin24h({ status: 'Scheduled', startTime: hoursFromNow(25) }, NOW)).toBe(false);
  });
  it('does not flag a past appt as upcoming', () => {
    expect(isWithin24h({ status: 'Scheduled', startTime: hoursFromNow(-1) }, NOW)).toBe(false);
  });

  it('splits a mixed list into missed and upcoming', () => {
    const appts = [
      { patientId: 'PT-1', status: 'Scheduled', startTime: hoursFromNow(-3) }, // missed
      { patientId: 'PT-2', status: 'Confirmed', startTime: hoursFromNow(6) },  // upcoming
      { patientId: 'PT-3', status: 'Completed', startTime: hoursFromNow(-3) }, // neither
      { patientId: 'PT-4', status: 'Scheduled', startTime: hoursFromNow(48) }, // neither (>24h)
    ];
    const { missed, upcoming } = computeApptAlerts(appts, NOW);
    expect(missed.map(m => m.patientId)).toEqual(['PT-1']);
    expect(upcoming.map(u => u.patientId)).toEqual(['PT-2']);
  });
});

describe('HRT refill alerts', () => {
  it('flags overdue and due-within-7-days, sorted most-overdue-first', () => {
    const recs = [
      { ref: 'PT-A', refillWindow: daysFromNowStr(-3) }, // overdue
      { ref: 'PT-B', refillWindow: daysFromNowStr(5) },  // due soon
      { ref: 'PT-C', refillWindow: daysFromNowStr(30) }, // not due
    ];
    const out = computeHrtAlerts(recs, NOW);
    expect(out.map(o => o.ref)).toEqual(['PT-A', 'PT-B']);
    expect(out[0].dueIn).toBeLessThan(0);
  });
  it('ignores blank/unparseable refillWindow', () => {
    const recs = [
      { ref: 'PT-A', refillWindow: '' },
      { ref: 'PT-B', refillWindow: 'not-a-date' },
      { ref: 'PT-C' },
    ];
    expect(computeHrtAlerts(recs, NOW)).toEqual([]);
  });
  it('daysUntil returns null for junk', () => {
    expect(daysUntil('nope', NOW)).toBeNull();
  });
});
