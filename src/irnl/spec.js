// spec.js — the canonical IRN program, loaded once.
//
// The `?raw` import is the single place the language reaches for a file, and it
// resolves under Vite and Vitest alike, so app code and tests read the exact
// same src/irnl/spec/irn.irn. The CLI runs under plain Node instead and reads
// the file with node:fs — see cli.js. Keeping that split here means compile.js
// stays a pure function of its input.

import { compile } from './compile.js';
import specSource from './spec/irn.irn?raw';

let cached = null;

/**
 * Recursively freeze a value.
 *
 * The canonical program is shared by every caller, so an unfrozen one is a
 * process-wide privilege escalation: `loadSpec().policies.aggregation.settings
 * .min_cell_size = 1` would lower the k-anonymity floor for everything running
 * in that process, silently and with no test failing. Invariants must not be
 * writable at runtime.
 *
 * @template T
 * @param {T} value
 * @returns {T} the same value, deeply frozen
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.getOwnPropertyNames(value)) deepFreeze(value[key]);
  return value;
}

/**
 * The canonical IRN program model. Compiled on first use, deeply frozen, and
 * shared: it describes invariants, so every caller reads the same object and
 * no caller can weaken it for the others.
 * @returns {object}
 */
export function loadSpec() {
  if (!cached) cached = deepFreeze(compile(specSource).program);
  return cached;
}

/** Raw text of the canonical spec, for diffing and for the conformance tests. */
export const CANONICAL_SOURCE = specSource;
