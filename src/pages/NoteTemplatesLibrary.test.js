import { describe, it, expect } from 'vitest';
import { DEFAULT_TEMPLATES, NOTE_SERVICE_TYPES, extractPlaceholders, fillTemplate } from './noteTemplateDefaults';

describe('extractPlaceholders', () => {
  it('finds unique variables in order of first appearance', () => {
    expect(extractPlaceholders('Hi [Name], see [Date]. [Name] again.')).toEqual(['Name', 'Date']);
  });
  it('ignores empty brackets and trims', () => {
    expect(extractPlaceholders('a [] b [ Spaced ] c')).toEqual(['Spaced']);
  });
  it('returns [] for no placeholders', () => {
    expect(extractPlaceholders('plain text')).toEqual([]);
  });
});

describe('fillTemplate', () => {
  it('substitutes provided values', () => {
    expect(fillTemplate('Hi [Name]', { Name: 'Jay' })).toBe('Hi Jay');
  });
  it('leaves unfilled placeholders in place', () => {
    const out = fillTemplate('[A] and [B]', { A: 'x' });
    expect(out).toBe('x and [B]');
  });
  it('treats empty-string value as unfilled', () => {
    expect(fillTemplate('[A]', { A: '' })).toBe('[A]');
  });
});

describe('DEFAULT_TEMPLATES', () => {
  it('ships 8 templates, each well-formed', () => {
    expect(DEFAULT_TEMPLATES).toHaveLength(8);
    for (const t of DEFAULT_TEMPLATES) {
      expect(typeof t.id).toBe('string');
      expect(t.name.length).toBeGreaterThan(0);
      expect(NOTE_SERVICE_TYPES).toContain(t.serviceType);
      expect(extractPlaceholders(t.body).length).toBeGreaterThan(0);
    }
  });
  it('has unique ids', () => {
    const ids = DEFAULT_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
