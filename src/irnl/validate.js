// validate.js — IRNL semantic analysis.
//
// Two severities, deliberately:
//
//   errors   — the program is malformed (typo'd verb, dangling reference,
//              duplicate name). Always fatal.
//   warnings — the program parses but WEAKENS a core IRN invariant (cell floor
//              below 5, vault B given a recovery path, the PHI boundary
//              allowing a network sink).
//
// conformance.test.js asserts zero errors AND zero warnings, which encodes the
// governance rule from CLAUDE.md exactly: weakening an invariant is possible,
// but only by editing a test — never by quietly editing a value. A typo'd verb
// must fail loudly rather than silently doing nothing, so unknown verbs are
// errors, not warnings.
//
// Pure module: no filesystem.

// Verbs each block kind understands. Anything else is a typo until proven
// otherwise — add deliberately.
const KNOWN_VERBS = {
  vault: new Set(['label', 'recovery', 'opens']),
  boundary: new Set(['never_leaves', 'deny', 'allow', 'require']),
  policy: new Set([
    'min_cell_size', 'group_by', 'on_below_floor', 'on_uncertain', 'deny',
    'forbid', 'require', 'sign_off', 'precedence', 'on_crisis', 'on_escalation',
    'read_signals'
  ])
};

// Field types the codegen knows how to emit. Enum/Ref take arguments.
const KNOWN_TYPES = new Set(['Ulid', 'Text', 'Int', 'Bool', 'Ciphertext', 'Enum', 'Ref', 'Timestamp']);

const PARAMETRIC_TYPES = new Set(['Enum', 'Ref']);

// Verbs that may legitimately appear more than once in a block: they accumulate
// into a list. EVERY OTHER verb is a single-valued setting, and repeating one is
// an error rather than last-wins.
//
// Why an error and not a silent override: validate.js reads the FIRST
// occurrence of a setting while compile.js's program model keeps the LAST, so a
// duplicate lets the two disagree — `min_cell_size 5` followed by
// `min_cell_size 1` validated clean while the runtime floor was 1. A weakened
// invariant that reports zero warnings is precisely the failure this language
// exists to prevent, so the shape that permits it is rejected outright.
const REPEATABLE_VERBS = new Set(['deny', 'allow', 'require', 'forbid']);

// Sinks that carry data off the device. The phi boundary must deny every one.
const NETWORK_SINKS = new Set(['cloud', 'p2p', 'telemetry', 'sms', 'analytics']);

// The floor below which an aggregate cell re-identifies people. See
// guardrails.js MIN_CELL_SIZE and the /privacy-agg skill.
export const REQUIRED_MIN_CELL_SIZE = 5;

const identOf = (value) => (value && value.v === 'ident' ? value.name : null);

/** Flatten a directive's args into plain idents, including inside call args. */
function argIdents(directive) {
  const out = [];
  for (const a of directive.args) {
    if (a.v === 'ident') out.push(a.name);
    else if (a.v === 'call') for (const inner of a.args) if (inner.v === 'ident') out.push(inner.name);
    else if (a.v === 'list') for (const inner of a.items) if (inner.v === 'ident') out.push(inner.name);
  }
  return out;
}

/** Find the calls named `name` among a directive's args. */
function callsNamed(directive, name) {
  return directive.args.filter((a) => a.v === 'call' && a.name === name);
}

/**
 * Validate an IRNL AST.
 * @param {{kind:'program', decls: object[]}} ast
 * @returns {{errors: Array<{message:string, line:number}>, warnings: Array<{message:string, line:number}>}}
 */
export function validate(ast) {
  const errors = [];
  const warnings = [];
  const err = (message, line) => errors.push({ message, line: line ?? 0 });
  const warn = (message, line) => warnings.push({ message, line: line ?? 0 });

  const decls = ast?.decls ?? [];
  const byKind = (k) => decls.filter((d) => d.kind === k);
  const entities = new Map(byKind('entity').map((e) => [e.name, e]));
  const vaults = new Map(byKind('vault').map((v) => [v.name, v]));

  // --- uniqueness -----------------------------------------------------------
  const seen = new Map();
  for (const d of decls) {
    const key = `${d.kind}:${d.name}`;
    if (seen.has(key)) {
      err(`duplicate ${d.kind} ${JSON.stringify(d.name)} (first declared on line ${seen.get(key)})`, d.line);
    } else {
      seen.set(key, d.line);
    }
  }

  // --- entities -------------------------------------------------------------
  for (const entity of entities.values()) {
    const fieldNames = new Set();
    for (const f of entity.fields) {
      if (fieldNames.has(f.name)) {
        err(`duplicate field ${JSON.stringify(f.name)} in entity ${entity.name}`, f.line);
      }
      fieldNames.add(f.name);

      if (!KNOWN_TYPES.has(f.type.name)) {
        err(`unknown type ${JSON.stringify(f.type.name)} on ${entity.name}.${f.name}`, f.line);
      }
      if (PARAMETRIC_TYPES.has(f.type.name) && f.type.args.length === 0) {
        err(`${f.type.name} on ${entity.name}.${f.name} needs arguments, e.g. ${f.type.name}(...)`, f.line);
      }
      if (f.type.name === 'Ref') {
        const target = identOf(f.type.args[0]);
        if (target && !entities.has(target)) {
          err(`${entity.name}.${f.name} references unknown entity ${JSON.stringify(target)}`, f.line);
        }
      }
      // Enum(A, B) on a `vault` field must name declared vaults.
      if (f.type.name === 'Enum' && f.name === 'vault') {
        for (const a of f.type.args) {
          const v = identOf(a);
          if (v && !vaults.has(v)) {
            err(`${entity.name}.${f.name} names undeclared vault ${JSON.stringify(v)}`, f.line);
          }
        }
      }
      // @aad(path) must resolve against a declared field of this entity.
      for (const ann of f.annotations) {
        if (ann.name !== 'aad') continue;
        const path = identOf(ann.args[0]);
        if (!path) {
          err(`@aad on ${entity.name}.${f.name} needs a field path, e.g. @aad(client.id)`, f.line);
          continue;
        }
        const root = path.split('.')[0];
        if (!entity.fields.some((x) => x.name === root)) {
          err(`@aad(${path}) on ${entity.name}.${f.name} has no field ${JSON.stringify(root)} to bind to`, f.line);
        }
      }
      // Anything marked @phi must actually be encrypted at rest.
      if (f.annotations.some((a) => a.name === 'phi') && f.type.name !== 'Ciphertext') {
        warn(`${entity.name}.${f.name} is @phi but typed ${f.type.name}; PHI must be Ciphertext`, f.line);
      }
    }
  }

  // --- directive verbs ------------------------------------------------------
  for (const d of decls) {
    if (d.kind === 'entity') continue;
    const known = KNOWN_VERBS[d.kind];
    const seenVerbs = new Map();
    for (const dir of d.directives) {
      if (!known.has(dir.verb)) {
        err(`unknown ${d.kind} directive ${JSON.stringify(dir.verb)} in ${JSON.stringify(d.name)}`, dir.line);
      }
      if (!REPEATABLE_VERBS.has(dir.verb)) {
        if (seenVerbs.has(dir.verb)) {
          err(
            `duplicate ${JSON.stringify(dir.verb)} in ${d.kind} ${JSON.stringify(d.name)} ` +
            `(first set on line ${seenVerbs.get(dir.verb)}); single-valued settings must appear once`,
            dir.line
          );
        } else {
          seenVerbs.set(dir.verb, dir.line);
        }
      }
    }
  }

  // --- invariant guards -----------------------------------------------------
  const vaultB = vaults.get('B');
  if (!vaultB) {
    warn('no vault B declared; Vault A / Vault B separation is a core invariant', 0);
  } else {
    const recovery = vaultB.directives.find((x) => x.verb === 'recovery');
    const mode = recovery ? identOf(recovery.args[0]) : null;
    if (mode !== 'none') {
      warn(`vault B recovery is ${JSON.stringify(mode ?? 'unset')}; it is unrecoverable by design (expected "none")`, vaultB.line);
    }
  }

  const phi = decls.find((d) => d.kind === 'boundary' && d.name === 'phi');
  if (!phi) {
    warn('no phi boundary declared; "no PHI leaves the device" is a core invariant', 0);
  } else {
    const denied = new Set();
    for (const dir of phi.directives) {
      if (dir.verb === 'deny') for (const s of argIdents(dir)) denied.add(s);
    }
    for (const sink of NETWORK_SINKS) {
      if (!denied.has(sink)) warn(`phi boundary does not deny sink ${JSON.stringify(sink)}`, phi.line);
    }
    // An unguarded allow of a network sink defeats the boundary outright.
    for (const dir of phi.directives) {
      if (dir.verb !== 'allow') continue;
      for (const call of callsNamed(dir, 'sink')) {
        for (const arg of call.args) {
          const s = identOf(arg);
          if (s && NETWORK_SINKS.has(s)) {
            warn(`phi boundary allows network sink ${JSON.stringify(s)}${dir.guard ? ' (guarded)' : ''}`, dir.line);
          }
        }
      }
    }
  }

  const agg = decls.find((d) => d.kind === 'policy' && d.name === 'aggregation');
  if (!agg) {
    warn('no aggregation policy declared; the k-anonymity floor is a core invariant', 0);
  } else {
    const dir = agg.directives.find((x) => x.verb === 'min_cell_size');
    const n = dir && dir.args[0]?.v === 'number' ? dir.args[0].value : null;
    if (n === null) {
      err('policy aggregation must declare min_cell_size', agg.line);
    } else if (!Number.isInteger(n) || n < REQUIRED_MIN_CELL_SIZE) {
      warn(`aggregation min_cell_size is ${n}; the k-anonymity floor is ${REQUIRED_MIN_CELL_SIZE}`, dir.line);
    }
    const below = agg.directives.find((x) => x.verb === 'on_below_floor');
    const action = below ? identOf(below.args[0]) : null;
    if (action && action !== 'suppress') {
      warn(`aggregation on_below_floor is ${JSON.stringify(action)}; small cells must be suppressed, not ${action}ed`, below.line);
    }
  }

  return { errors, warnings };
}
