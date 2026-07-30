import { describe, it, expect, vi } from 'vitest';
import { HiveMindEngine, admissionGate } from './hiveEngine';
import { FILING_RULE_SEEDS, seedHiveFilingRules } from './hiveSeed';

// Stub the embedder so these unit tests are deterministic and never touch the
// network. getVectorEmbedding otherwise attempts a 2s fetch to Ollama per call;
// with 13 seeds x multiple runs that intermittently blew past vitest's 5s
// timeout when Ollama WAS reachable (real round-trips) — a flaky failure that had
// nothing to do with correctness. A fixed unit-norm vector keeps insert/search
// working without any embedding backend.
vi.mock('./hiveEngine', async (importOriginal) => {
  const actual = await importOriginal();
  const mockVec = new Array(768).fill(0).map((_, i) => Math.sin(i));
  const mag = Math.sqrt(mockVec.reduce((a, v) => a + v * v, 0));
  const unit = mockVec.map(v => v / mag);
  return { ...actual, getVectorEmbedding: vi.fn(async () => unit.slice()) };
});

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

// Each test targets a FRESH HiveMindEngine (seedHiveFilingRules takes an optional
// engine). This is hermetic — it never touches the process-wide `hiveMind`
// singleton — so these tests cannot bleed state into, or flake against, other
// files that import the singleton.
describe('seedHiveFilingRules — idempotent insert into a fresh engine', () => {
  it('inserts all seeds on first run, skips all on a second run', async () => {
    const engine = new HiveMindEngine();
    const first = await seedHiveFilingRules(engine);
    expect(first.rejected).toEqual([]);
    expect(first.inserted.length).toBe(FILING_RULE_SEEDS.length);
    expect(first.skipped).toEqual([]);
    expect(engine.flatten().length).toBe(FILING_RULE_SEEDS.length);

    const second = await seedHiveFilingRules(engine);
    expect(second.inserted).toEqual([]);
    expect(second.skipped.length).toBe(FILING_RULE_SEEDS.length);
    // No duplication.
    expect(engine.flatten().length).toBe(FILING_RULE_SEEDS.length);
  });

  it('seeded entries are retrievable by semantic search (mock-vector fallback ok)', async () => {
    const engine = new HiveMindEngine();
    await seedHiveFilingRules(engine);
    const res = await engine.semanticSearch('Maryland small claims filing fee');
    expect(res).not.toBeNull();
    expect(res.node).toBeTruthy();
    // With the deterministic mock embedding (no Ollama in test), we can't assert
    // WHICH entry wins, only that search returns a real seeded node.
    const keys = FILING_RULE_SEEDS.map(s => s.key);
    expect(keys).toContain(res.node.key);
  });

  it('a fresh engine holds nothing until seeded, then holds the seeds', async () => {
    const engine = new HiveMindEngine();
    expect(engine.flatten().length).toBe(0);
    const { inserted } = await seedHiveFilingRules(engine);
    expect(inserted.length).toBe(FILING_RULE_SEEDS.length);
    expect(engine.flatten().length).toBe(FILING_RULE_SEEDS.length);
  });
});
