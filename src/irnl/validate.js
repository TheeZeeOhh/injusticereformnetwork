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
    'read_signals', 'denominations'
  ])
};

// Annotations the language understands. An unknown one is a typo until proven
// otherwise, and it is an ERROR rather than a warning for the same reason an
// unknown verb is: `@denominatd(hours)` would silently drop a field out of the
// convertibility check while the file still read as if it were covered. A
// guardrail that stops applying without anything failing is the one failure
// mode this language exists to prevent.
const KNOWN_ANNOTATIONS = new Set([
  'identity', 'pii', 'phi', 'quasi_identifier', 'aad', 'count', 'denominated'
]);

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

/**
 * Fold a field name to the form the forbidden-identity list is written in, so
 * `dateOfBirth`, `DateOfBirth` and `date_of_birth` are all the same field. The
 * list is a compliance boundary, not a style guide — spelling must not be a way
 * around it.
 * @param {string} name
 * @returns {string}
 */
export const normalizeFieldName = (name) =>
  String(name).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/**
 * Flatten a directive's args into plain idents, reaching inside call args and
 * list items.
 *
 * The braces are load-bearing. Written brace-free, the `else if` for lists
 * binds to the inner `if` of the call branch instead of to the outer chain, so
 * list arguments silently flatten to nothing — a boundary that denied
 * `sink[cloud, p2p]` would have read as denying nothing at all, with no error.
 */
function argIdents(directive) {
  const out = [];
  for (const a of directive.args) {
    if (a.v === 'ident') {
      out.push(a.name);
    } else if (a.v === 'call') {
      for (const inner of a.args) if (inner.v === 'ident') out.push(inner.name);
    } else if (a.v === 'list') {
      for (const inner of a.items) if (inner.v === 'ident') out.push(inner.name);
    }
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

  // Read up front: the entity loop below needs the declared denominations and
  // the forbidden identity-field list to check field declarations against.
  const commons = decls.find((d) => d.kind === 'policy' && d.name === 'commons_scope');
  const commonsForbids = (commons?.directives ?? []).filter((x) => x.verb === 'forbid');
  const declaredDenominations = new Set(
    (commons?.directives ?? [])
      .filter((x) => x.verb === 'denominations')
      .flatMap((x) => argIdents(x))
  );
  const forbiddenIdentityFields = new Set(
    commonsForbids
      .flatMap((d) => callsNamed(d, 'identity_field'))
      .flatMap((c) => c.args.map(identOf))
      .filter(Boolean)
      .map(normalizeFieldName)
  );

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
    // Denominations appearing anywhere on this entity. More than one means the
    // record itself is a conversion — see the check after the field loop.
    const denominations = new Set();
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
      // A KYC-shaped field must not exist anywhere in IRN's declared shapes.
      // This is checked against every entity, not only the Commons ones: the
      // rule is "IRN does not collect this", and an identity column is exactly
      // as re-identifying on a Sanctuary record as on a Participant.
      if (forbiddenIdentityFields.has(normalizeFieldName(f.name))) {
        warn(
          `${entity.name}.${f.name} is a KYC identity field that policy commons_scope forbids; ` +
          'IRN does not collect it, and what is never collected cannot be produced under subpoena',
          f.line
        );
      }

      // @denominated(x) binds a field to a unit of account. `x` must be one the
      // spec declares, or the field is silently outside the conversion check.
      for (const ann of f.annotations) {
        if (!KNOWN_ANNOTATIONS.has(ann.name)) {
          err(`unknown annotation @${ann.name} on ${entity.name}.${f.name}`, f.line);
        }
        if (ann.name !== 'denominated') continue;
        const unit = identOf(ann.args[0]);
        if (!unit) {
          err(`@denominated on ${entity.name}.${f.name} needs a unit, e.g. @denominated(hours)`, f.line);
          continue;
        }
        if (declaredDenominations.size && !declaredDenominations.has(unit)) {
          err(
            `@denominated(${unit}) on ${entity.name}.${f.name} names a unit no policy declares; ` +
            `known: ${[...declaredDenominations].join(', ')}`,
            f.line
          );
          continue;
        }
        denominations.add(unit);
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

    // Two denominations on one record IS a conversion — that record is where a
    // rate would have to live. Hours are mutual credit precisely because no row
    // anywhere holds an hours figure and a dollars figure side by side, so this
    // is the structural form of "hours cannot be bought or redeemed".
    if (denominations.size > 1) {
      warn(
        `entity ${entity.name} carries ${denominations.size} denominations ` +
        `(${[...denominations].sort().join(', ')}); a record holding both is a conversion, ` +
        'which commons_scope forbids',
        entity.line
      );
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

  // --- commons scope wall ---------------------------------------------------
  // Hours are mutual credit and aid is IRN's own money. Neither may become the
  // other, and neither rail collects KYC identity. Deleting this policy is the
  // cheapest way to lose both, so its absence warns rather than passing quietly.
  if (!commons) {
    warn(
      'no commons_scope policy declared; hours must not be convertible to dollars ' +
      'and no entity may collect KYC identity fields',
      0
    );
  } else {
    const converts = new Set(
      commonsForbids
        .flatMap((d) => callsNamed(d, 'convert'))
        .map((c) => c.args.map(identOf).join('->'))
    );
    // Both directions, explicitly. Forbidding redemption while leaving purchase
    // open still makes hours something dollars can buy, which is the same wall
    // with a door in it.
    for (const [from, to] of [['hours', 'dollars'], ['dollars', 'hours']]) {
      if (!converts.has(`${from}->${to}`)) {
        warn(
          `commons_scope does not forbid convert(${from}, ${to}); hours are mutual credit ` +
          'and must be neither purchasable nor redeemable',
          commons.line
        );
      }
    }
    if (forbiddenIdentityFields.size === 0) {
      warn(
        'commons_scope declares no forbidden identity_field list; KYC-shaped fields ' +
        'would go unchecked on every entity',
        commons.line
      );
    }
    // The denominations named in the convert rules must be declared, or the
    // rules forbid conversions between units nothing in the spec uses.
    for (const unit of ['hours', 'dollars']) {
      if (!declaredDenominations.has(unit)) {
        warn(`commons_scope forbids conversions involving ${JSON.stringify(unit)} but does not declare it as a denomination`, commons.line);
      }
    }
  }

  return { errors, warnings };
}
