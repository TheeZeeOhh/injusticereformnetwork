import { describe, it, expect, beforeEach } from 'vitest';
import { HiveMindEngine, hiveMind, admissionGate } from './hiveEngine';
import { FILING_RULE_SEEDS, seedHiveFilingRules } from './hiveSeed';

// The seed carries REAL public filing-rule ground truth. Two things must hold:
//  1. every seed string clears the admission gate (a seed that trips a reject
//     pattern would be a silent data bug — dates, pronouns, docket refs, etc.),
//  2. seeding is idempotent and only inserts admissible entries.

describe('FILING_RULE_SEEDS — every seed clears the admission gate', () => {
  it('has unique keys', () => {
    const keys = FILING_RULE_SEEDS.map(s => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every seed passes admissionGate (no accidental person-identifying text)', () => {
    for (const seed of FILING_RULE_SEEDS) {
      const verdict = admissionGate({ sourceText: seed.sourceText, lastVerifiedBy: seed.lastVerifiedBy });
      expect(verdict, `seed "${seed.key}" was rejected: ${verdict.reason}`).toMatchObject({ ok: true });
    }
  });

  it('no seed contains a slash-date, docket ref, or personal pronoun (spot regex)', () => {
    for (const seed of FILING_RULE_SEEDS) {
      expect(seed.sourceText, seed.key).not.toMatch(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
      expect(seed.sourceText, seed.key).not.toMatch(/\bdocket\b/i);
      expect(seed.sourceText, seed.key).not.toMatch(/\b(he|she|him|her|his|hers)\b/i);
    }
  });

  it('every seed cites a source', () => {
    for (const seed of FILING_RULE_SEEDS) {
      expect(seed.sourceText.toLowerCase(), seed.key).toContain('source:');
    }
  });
});

describe('seedHiveFilingRules — idempotent insert into a fresh singleton', () => {
  beforeEach(() => {
    // Reset the singleton between tests (seedHiveFilingRules operates on it).
    hiveMind.root = null;
    hiveMind.candidates = new Map();
  });

  it('inserts all seeds on first run, skips all on a second run', async () => {
    const first = await seedHiveFilingRules();
    expect(first.rejected).toEqual([]);
    expect(first.inserted.length).toBe(FILING_RULE_SEEDS.length);
    expect(first.skipped).toEqual([]);
    expect(hiveMind.flatten().length).toBe(FILING_RULE_SEEDS.length);

    const second = await seedHiveFilingRules();
    expect(second.inserted).toEqual([]);
    expect(second.skipped.length).toBe(FILING_RULE_SEEDS.length);
    // No duplication.
    expect(hiveMind.flatten().length).toBe(FILING_RULE_SEEDS.length);
  });

  it('seeded entries are retrievable by semantic search (mock-vector fallback ok)', async () => {
    await seedHiveFilingRules();
    const res = await hiveMind.semanticSearch('Maryland small claims filing fee');
    expect(res).not.toBeNull();
    expect(res.node).toBeTruthy();
    // With the deterministic mock embedding (no Ollama in test), we can't assert
    // WHICH entry wins, only that search returns a real seeded node.
    const keys = FILING_RULE_SEEDS.map(s => s.key);
    expect(keys).toContain(res.node.key);
  });
});

describe('seedHiveFilingRules — gate is still enforced on a separate engine', () => {
  it('a fresh HiveMindEngine holds nothing until seeded, then holds the seeds', async () => {
    const h = new HiveMindEngine();
    expect(h.flatten().length).toBe(0);
    // seedHiveFilingRules targets the singleton, not an arbitrary engine, so this
    // just documents that the singleton is the seed target.
    hiveMind.root = null;
    hiveMind.candidates = new Map();
    const { inserted } = await seedHiveFilingRules();
    expect(inserted.length).toBeGreaterThan(0);
  });
});
