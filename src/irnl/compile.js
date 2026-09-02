// compile.js — IRNL front end and public API.
//
// compile(source)  -> { program, errors, warnings }
// loadSpec()       -> the canonical IRN program (src/irnl/spec/irn.irn)
//
// `program` is the queryable model the rest of the system reads. Nothing
// downstream should walk the raw AST; if a consumer needs something the model
// doesn't expose, add it here so every consumer sees the same shape.
//
// Pure module: no filesystem, no bundler-specific imports, so it runs equally
// under Vite, Vitest and plain Node. Loading the canonical spec is spec.js's
// job — that is the one place that needs a `?raw` import.

import { parse } from './parser.js';
import { validate } from './validate.js';

export class IrnlCompileError extends Error {
  constructor(errors) {
    const detail = errors.map((e) => `  line ${e.line}: ${e.message}`).join('\n');
    super(`IRNL program has ${errors.length} error(s):\n${detail}`);
    this.name = 'IrnlCompileError';
    this.errors = errors;
  }
}

const identOf = (v) => (v && v.v === 'ident' ? v.name : null);

/** Reduce a value node to a plain JS value for the program model. */
function plain(value) {
  if (!value) return null;
  switch (value.v) {
    case 'number':
    case 'string':
      return value.value;
    case 'ident':
      return value.name;
    case 'list':
      return value.items.map(plain);
    case 'call':
      return { call: value.name, args: value.args.map(plain) };
    case 'compare':
      return { left: value.left, op: value.op, right: value.right };
    default:
      return null;
  }
}

function buildVault(decl) {
  const out = { name: decl.name, label: null, recovery: null, opens: null };
  for (const d of decl.directives) {
    const v = plain(d.args[0]);
    if (d.verb === 'label') out.label = v;
    if (d.verb === 'recovery') out.recovery = v;
    if (d.verb === 'opens') out.opens = v;
  }
  return out;
}

function buildEntity(decl) {
  return {
    name: decl.name,
    fields: decl.fields.map((f) => ({
      name: f.name,
      type: f.type.name,
      typeArgs: f.type.args.map(plain),
      annotations: f.annotations.map((a) => ({ name: a.name, args: a.args.map(plain) })),
      // Convenience flags — every consumer needs these and should not re-derive them.
      isPhi: f.annotations.some((a) => a.name === 'phi'),
      isPii: f.annotations.some((a) => a.name === 'pii'),
      isIdentity: f.annotations.some((a) => a.name === 'identity'),
      isQuasiIdentifier: f.annotations.some((a) => a.name === 'quasi_identifier'),
      aad: f.annotations.find((a) => a.name === 'aad')?.args.map(plain)[0] ?? null
    }))
  };
}

function buildBoundary(decl) {
  const out = { name: decl.name, neverLeaves: null, deny: [], allow: [], require: [] };
  for (const d of decl.directives) {
    if (d.verb === 'never_leaves') {
      out.neverLeaves = plain(d.args[0]);
      continue;
    }
    // deny/allow carry either bare idents or sink(...)/other calls; flatten to
    // a list of subject names plus the guard that qualifies them.
    const subjects = [];
    for (const a of d.args) {
      if (a.v === 'ident') subjects.push(a.name);
      else if (a.v === 'call') for (const inner of a.args) { const n = identOf(inner); if (n) subjects.push(n); }
    }
    const channel = d.args.find((a) => a.v === 'call')?.name ?? null;
    const entry = { channel, subjects, guard: d.guard ? plain(d.guard) : null };
    if (d.verb === 'deny') out.deny.push(entry);
    else if (d.verb === 'allow') out.allow.push(entry);
    else if (d.verb === 'require') out.require.push({ ...entry, args: d.args.map(plain) });
  }
  return out;
}

function buildPolicy(decl) {
  const out = { name: decl.name, directives: [], deny: [], forbid: [], require: [], settings: {} };
  for (const d of decl.directives) {
    out.directives.push({ verb: d.verb, args: d.args.map(plain), guard: d.guard ? plain(d.guard) : null });
    if (d.verb === 'deny') out.deny.push(...d.args.map(plain));
    else if (d.verb === 'forbid') out.forbid.push(...d.args.map(plain));
    else if (d.verb === 'require') out.require.push(...d.args.map(plain));
    else out.settings[d.verb] = d.args.length === 1 ? plain(d.args[0]) : d.args.map(plain);
  }
  return out;
}

/**
 * Compile IRNL source into the program model.
 * @param {string} source
 * @param {{strict?: boolean}} [options] strict throws on errors (default true)
 * @returns {{program: object, errors: object[], warnings: object[]}}
 */
export function compile(source, options = {}) {
  const { strict = true } = options;
  const ast = parse(source);
  const { errors, warnings } = validate(ast);
  if (strict && errors.length) throw new IrnlCompileError(errors);

  const program = {
    vaults: {},
    entities: {},
    boundaries: {},
    policies: {}
  };
  for (const d of ast.decls) {
    if (d.kind === 'vault') program.vaults[d.name] = buildVault(d);
    else if (d.kind === 'entity') program.entities[d.name] = buildEntity(d);
    else if (d.kind === 'boundary') program.boundaries[d.name] = buildBoundary(d);
    else if (d.kind === 'policy') program.policies[d.name] = buildPolicy(d);
  }
  return { program, errors, warnings, ast };
}
