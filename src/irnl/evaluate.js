// evaluate.js — IRNL policy runtime.
//
// These functions read the compiled program and answer questions the app asks
// at runtime: may this data leave by this channel, is this cell emittable,
// which columns are quasi-identifiers. They are the enforcement half of the
// language — the half that makes irn.irn load-bearing rather than documentation.
//
// Default-closed everywhere: an unknown boundary, an unknown sink, or a missing
// policy denies. "Uncertainty -> silence" is the house rule, so an absent rule
// must never read as permission.
//
// Pure module.

import { loadSpec } from './spec.js';

/**
 * The k-anonymity floor declared by the program.
 * @param {object} [program]
 * @returns {number}
 */
export function minCellSize(program = loadSpec()) {
  const n = program.policies?.aggregation?.settings?.min_cell_size;
  // Default-closed: if the policy is missing, fall back to the strictest known
  // floor rather than to 0, which would emit everything.
  return typeof n === 'number' && Number.isFinite(n) ? n : Infinity;
}

/**
 * True when an aggregate cell of size `n` may be emitted.
 * @param {number} n
 * @param {object} [program]
 * @returns {boolean}
 */
export function cellEmittable(n, program = loadSpec()) {
  return Number.isFinite(n) && n >= minCellSize(program);
}

/**
 * Column names annotated @quasi_identifier on an entity. These are the columns
 * whose COMBINATION must clear the floor — the reason a single-column check is
 * insufficient.
 * @param {string} entityName
 * @param {object} [program]
 * @returns {string[]}
 */
export function quasiIdentifiersOf(entityName, program = loadSpec()) {
  const entity = program.entities?.[entityName];
  if (!entity) return [];
  return entity.fields.filter((f) => f.isQuasiIdentifier).map((f) => f.name);
}

/**
 * Every column declared @quasi_identifier anywhere in the program, as a sorted
 * union across entities.
 *
 * Entity-agnostic on purpose: person-level rows handed to an aggregation
 * routine are often a join and do not map cleanly onto one entity, and the
 * safe reading of "is this column a quasi-identifier?" is "does IRN consider
 * it one anywhere", not "does it belong to this table".
 *
 * @param {object} [program]
 * @returns {string[]}
 */
export function declaredQuasiIdentifiers(program = loadSpec()) {
  const out = new Set();
  for (const entity of Object.values(program.entities ?? {})) {
    for (const f of entity.fields) if (f.isQuasiIdentifier) out.add(f.name);
  }
  return [...out].sort();
}

/**
 * Fields carrying PHI on an entity (must be Ciphertext; see validate.js).
 * @param {string} entityName
 * @param {object} [program]
 * @returns {string[]}
 */
export function phiFieldsOf(entityName, program = loadSpec()) {
  return (program.entities?.[entityName]?.fields ?? []).filter((f) => f.isPhi).map((f) => f.name);
}

/**
 * Decide whether data governed by `boundaryName` may travel to `sink`.
 *
 * Deny wins over allow, always — a sink named in both is denied. An allow with
 * a `when` guard only applies if the caller asserts that condition in
 * `context.conditions`. Anything not explicitly allowed is denied.
 *
 * @param {string} boundaryName        e.g. 'phi'
 * @param {string} sink                e.g. 'cloud', 'local_disk'
 * @param {{conditions?: string[]}} [context]
 * @param {object} [program]
 * @returns {{allowed: boolean, why: string}}
 */
export function sinkDecision(boundaryName, sink, context = {}, program = loadSpec()) {
  const boundary = program.boundaries?.[boundaryName];
  if (!boundary) {
    return { allowed: false, why: `no boundary ${JSON.stringify(boundaryName)} declared; denying by default` };
  }
  for (const rule of boundary.deny) {
    if (rule.subjects.includes(sink)) {
      return { allowed: false, why: `${boundaryName} denies sink ${JSON.stringify(sink)}` };
    }
  }
  const conditions = new Set(context.conditions ?? []);
  for (const rule of boundary.allow) {
    if (!rule.subjects.includes(sink)) continue;
    if (rule.guard && !conditions.has(rule.guard)) {
      return {
        allowed: false,
        why: `${boundaryName} allows ${JSON.stringify(sink)} only when ${rule.guard}; caller did not assert it`
      };
    }
    return { allowed: true, why: rule.guard ? `allowed when ${rule.guard}` : 'explicitly allowed' };
  }
  return { allowed: false, why: `${boundaryName} does not allow sink ${JSON.stringify(sink)}; denying by default` };
}

/**
 * Convenience predicate for the common case.
 * @returns {boolean}
 */
export function sinkAllowed(boundaryName, sink, context, program) {
  return sinkDecision(boundaryName, sink, context, program).allowed;
}

/**
 * True when a policy forbids the named subject, e.g.
 * policyForbids('vault_separation', 'cross_key').
 * @param {string} policyName
 * @param {string} subject
 * @param {object} [program]
 * @returns {boolean}
 */
export function policyForbids(policyName, subject, program = loadSpec()) {
  const policy = program.policies?.[policyName];
  if (!policy) return true; // default-closed
  const named = (entry) => (typeof entry === 'string' ? entry : entry?.call);
  return [...policy.forbid, ...policy.deny].some((e) => named(e) === subject);
}

/**
 * Numeric floors declared as `require x >= n` on a policy, e.g. the hive-mind
 * source_count floor.
 * @param {string} policyName
 * @param {string} left
 * @param {object} [program]
 * @returns {{op: string, right: number}|null}
 */
export function policyThreshold(policyName, left, program = loadSpec()) {
  const policy = program.policies?.[policyName];
  if (!policy) return null;
  const found = policy.require.find((r) => r && typeof r === 'object' && r.left === left);
  return found ? { op: found.op, right: found.right } : null;
}

/**
 * Enforce a declared numeric floor. Default-closed when undeclared.
 * @param {string} policyName
 * @param {string} left
 * @param {number} actual
 * @param {object} [program]
 * @returns {boolean}
 */
export function meetsThreshold(policyName, left, actual, program = loadSpec()) {
  const t = policyThreshold(policyName, left, program);
  if (!t || !Number.isFinite(actual)) return false;
  switch (t.op) {
    case '>=': return actual >= t.right;
    case '>': return actual > t.right;
    case '<=': return actual <= t.right;
    case '<': return actual < t.right;
    case '==': return actual === t.right;
    case '!=': return actual !== t.right;
    default: return false;
  }
}
