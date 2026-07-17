import { describe, it, expect } from 'vitest';
import { classifyRoute } from './routeEngine';

// The core safety property: default-closed. If the router is ever wrong, it must
// be wrong in the direction of KEEPING DATA LOCAL, never toward leaking it.

describe('classifyRoute — must route LOCAL (default-closed)', () => {
  it('keeps anything with a client referent local, even if it looks routine', () => {
    // These phrasings are lifted from the assistant's own test corpus — they are
    // exactly what navigators actually type, and every one is a person's record.
    expect(classifyRoute('my client was evicted and needs shelter')).toBe('local');
    expect(classifyRoute('client wants to get into MAT treatment')).toBe('local');
    expect(classifyRoute('my client is hungry, needs a food pantry')).toBe('local');
  });

  it('keeps first-person situations local', () => {
    expect(classifyRoute('I got a violation notice, what do I do')).toBe('local');
    expect(classifyRoute("what's the appeal window for my denial")).toBe('local');
  });

  it('keeps pronoun-referent questions local', () => {
    expect(classifyRoute('what does she need to file for her name change')).toBe('local');
    expect(classifyRoute('they missed a court date, now what')).toBe('local');
  });

  it('never treats high-stakes topics as generic', () => {
    expect(classifyRoute('what is CPS custody process')).toBe('local');
    expect(classifyRoute('what is immigration parole')).toBe('local');
    expect(classifyRoute('what does gender-affirming care intake mean')).toBe('local');
  });

  it('suppresses hosted routing when a client record is open on screen', () => {
    expect(classifyRoute('what is a continuance', { clientRecordOpen: true })).toBe('local');
  });

  it('keeps long, specific, jurisdiction-tagged questions local (quasi-identifier)', () => {
    const q = 'what is a continuance in Norfolk Virginia 757 general district court '
      + 'for a reentry client with a Tuesday hearing this specific week';
    expect(classifyRoute(q)).toBe('local');
  });

  it('defaults empty / unclear input to local', () => {
    expect(classifyRoute('')).toBe('local');
    expect(classifyRoute('hi')).toBe('local');
    expect(classifyRoute('help')).toBe('local');
  });
});

describe('classifyRoute — eligible for HOSTED (generic, referent-free)', () => {
  it('allows bare definitional questions with no person attached', () => {
    expect(classifyRoute('what is a continuance')).toBe('hosted');
    expect(classifyRoute('what does arraignment mean')).toBe('hosted');
    expect(classifyRoute("what's the difference between parole and probation")).toBe('hosted');
  });

  it('allows a short definitional question even with a bare jurisdiction token', () => {
    expect(classifyRoute('what is expungement in Virginia')).toBe('hosted');
  });
});
