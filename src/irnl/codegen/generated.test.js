// generated.test.js — the generated files must match the spec.
//
// Lives as a test rather than a hook step so it runs under the existing
// commit gate, in CI, and on any machine, without anyone remembering to wire
// it up. Editing src/irnl/spec/irn.irn and forgetting to regenerate is exactly
// the drift this language exists to prevent, so it fails the suite.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TARGETS } from './index.js';
import { loadSpec } from '../spec.js';

const ROOT = resolve(import.meta.dirname, '../../..');
const program = loadSpec();

describe('IRNL generated files are current', () => {
  for (const [name, target] of Object.entries(TARGETS)) {
    it(`${target.path} (${name}) matches the spec`, () => {
      const outPath = resolve(ROOT, target.path);
      expect(existsSync(outPath), `${target.path} missing — run: npm run irnl:build`).toBe(true);
      const current = readFileSync(outPath, 'utf8');
      expect(current, `${target.path} is stale — run: npm run irnl:build`).toBe(target.emit(program));
    });
  }
});
