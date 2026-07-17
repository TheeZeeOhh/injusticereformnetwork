import { describe, it, expect } from 'vitest';
import { normalizeJitsiDomain } from './settingsStore';

// The Telehealth iframe origin is built from this value, so normalization is a
// security boundary: it must reduce operator input to a bare host (or '') and
// never let a scheme/path/garbage through that could steer the call elsewhere.
describe('normalizeJitsiDomain', () => {
  it('accepts a plain host', () => {
    expect(normalizeJitsiDomain('meet.yourorg.org')).toBe('meet.yourorg.org');
  });

  it('strips scheme and trailing slash', () => {
    expect(normalizeJitsiDomain('https://meet.yourorg.org/')).toBe('meet.yourorg.org');
    expect(normalizeJitsiDomain('http://meet.yourorg.org')).toBe('meet.yourorg.org');
  });

  it('drops any path (cannot smuggle a different origin)', () => {
    expect(normalizeJitsiDomain('meet.yourorg.org/evil')).toBe('meet.yourorg.org');
    expect(normalizeJitsiDomain('https://meet.jit.si/@attacker')).toBe('meet.jit.si');
  });

  it('keeps an explicit port', () => {
    expect(normalizeJitsiDomain('meet.yourorg.org:8443')).toBe('meet.yourorg.org:8443');
  });

  it('lowercases the host', () => {
    expect(normalizeJitsiDomain('Meet.YourOrg.ORG')).toBe('meet.yourorg.org');
  });

  it('returns empty for blank or invalid input (disables telehealth)', () => {
    expect(normalizeJitsiDomain('')).toBe('');
    expect(normalizeJitsiDomain('   ')).toBe('');
    expect(normalizeJitsiDomain(undefined)).toBe('');
    expect(normalizeJitsiDomain('has spaces')).toBe('');
    expect(normalizeJitsiDomain('bad_host!')).toBe('');
    expect(normalizeJitsiDomain('javascript:alert(1)')).toBe('');
  });
});
