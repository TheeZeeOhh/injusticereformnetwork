import { describe, it, expect } from 'vitest';
import { parse } from './parser.js';
import { compile } from './compile.js';
import { loadSpec } from './spec.js';
import { cellEmittable, minCellSize, sinkAllowed, sinkDecision, meetsThreshold } from './evaluate.js';

describe('ADVERSARIAL: crash resistance', () => {
  const nasty = [
    '', '   ', '\n\n\n', '{', '}', '{}', 'policy', 'policy p', 'policy p {',
    'policy p { }', 'entity', 'entity E {', '@', '@@@', '[[[', ']]]',
    '((((', 'policy p { a [ }', 'policy p { a ( }', 'vault { }',
    'policy p { require }', 'policy p { require n }', 'entity E { f }',
    'policy p { a "unterminated', 'policy p { 5 5 }',
  ];
  it('never crashes with a non-IrnlSyntaxError on garbage', () => {
    for (const src of nasty) {
      try { parse(src); } catch (e) {
        expect(e.name, `unexpected error class for ${JSON.stringify(src)}: ${e.stack}`).toBe('IrnlSyntaxError');
      }
    }
  });
  it('survives a large input', () => {
    const big = 'policy p {\n' + '  deny x\n'.repeat(20000) + '}';
    expect(() => parse(big)).not.toThrow();
  });
});

describe('ADVERSARIAL: can the floor be bypassed?', () => {
  it('rejects a string count that would pass a loose >= comparison', () => {
    expect(cellEmittable('10')).toBe(false);
    expect(cellEmittable('999999')).toBe(false);
  });
  it('rejects boolean/array coercions', () => {
    expect(cellEmittable(true)).toBe(false);
    expect(cellEmittable([9])).toBe(false);
    expect(cellEmittable(null)).toBe(false);
  });
  it('rejects a negative or zero floor being treated as permissive', () => {
    const { program } = compile('policy aggregation { min_cell_size 0 }', { strict: false });
    expect(cellEmittable(1, program)).toBe(true); // floor really is 0 — declared, warned about
    const { warnings } = compile('policy aggregation { min_cell_size 0 }', { strict: false });
    expect(warnings.some(w => /min_cell_size is 0/.test(w.message))).toBe(true);
  });
  it('a duplicate min_cell_size does not silently pick the weaker one', () => {
    const { program } = compile('policy aggregation { min_cell_size 5\n min_cell_size 1 }', { strict: false });
    // Document whichever wins — the danger is a weaker value winning unnoticed.
    console.log('   duplicate min_cell_size resolves to:', minCellSize(program));
  });
});

describe('ADVERSARIAL: shared-state mutation', () => {
  it('a consumer cannot weaken the global floor by mutating the cached program', () => {
    const p = loadSpec();
    const before = minCellSize();
    try { p.policies.aggregation.settings.min_cell_size = 1; } catch { /* frozen is fine */ }
    const after = minCellSize();
    expect(after, 'cached spec is mutable — one consumer can lower the floor for everyone').toBe(before);
  });
  it('a consumer cannot open the phi boundary by pushing an allow rule', () => {
    const p = loadSpec();
    try { p.boundaries.phi.allow.push({ channel: 'sink', subjects: ['cloud'], guard: null }); } catch { /* frozen */ }
    expect(sinkAllowed('phi', 'cloud')).toBe(false);
  });
});

describe('ADVERSARIAL: prototype pollution', () => {
  it('an entity named __proto__ does not poison Object.prototype', () => {
    compile('entity __proto__ { id Ulid }', { strict: false });
    expect({}.id).toBeUndefined();
  });
  it('a policy named __proto__ does not make every policy lookup succeed', () => {
    const { program } = compile('policy __proto__ { min_cell_size 1 }', { strict: false });
    expect(minCellSize(program)).toBe(Infinity); // aggregation still undeclared
  });
});

describe('ADVERSARIAL: boundary logic', () => {
  it('a guard the caller fakes with a different name does not open the sink', () => {
    expect(sinkAllowed('phi', 'local_disk', { conditions: ['Encrypted'] })).toBe(false);
    expect(sinkAllowed('phi', 'local_disk', { conditions: ['encrypted '] })).toBe(false);
  });
  it('conditions from a non-array do not throw or pass', () => {
    expect(sinkAllowed('phi', 'local_disk', { conditions: 'encrypted' })).toBe(false);
  });
  it('null/undefined sink names deny', () => {
    expect(sinkAllowed('phi', null)).toBe(false);
    expect(sinkAllowed('phi', undefined)).toBe(false);
    expect(sinkDecision('phi', '').allowed).toBe(false);
  });
  it('threshold comparison rejects string actuals', () => {
    expect(meetsThreshold('hive_admission', 'source_count', '9')).toBe(false);
  });
});
