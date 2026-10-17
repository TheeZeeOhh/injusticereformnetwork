# IRNL — the IRN system language

A small declarative language for IRN's invariants, and the toolchain that makes
them executable.

## Why this exists

IRN's guardrails were prose. The k-anonymity floor, vault A/B separation, the
PHI boundary, the hive-mind admission gate — each was written in `CLAUDE.md`, in
memory files, in system prompts, and in code comments, then re-implemented by
hand in each of six codebases.

Prose drifts silently. The `ai-twin-custom` model carried a persona that had
forked from `zee_persona.DEFAULT_SYSTEM_PROMPT` and lost an entire security
override; nothing failed, nothing warned. That is the failure mode this language
removes.

IRNL is **not** a general-purpose language and does not replace any part of the
crypto stack. It sits above it: one parsed artifact that the shipping code is
tested against, so weakening an invariant becomes a failing test rather than a
quiet edit.

## The one file that matters

[`spec/irn.irn`](spec/irn.irn) is the canonical definition. Everything else in
this directory is machinery for reading it, checking it, and generating from it.

## Commands

```bash
npm run irnl:check          # validate the spec (exit 1 = malformed, 2 = weakened)
npm run irnl:build          # regenerate TS / Rust / Python types
npm run irnl -- build --check   # CI: fail if generated files are stale
```

`npm test` covers all of this already — the conformance and freshness tests run
in the existing commit gate.

## Language

Four declarations. Directives are newline-terminated; `#` and `//` both comment.

### `vault`

```irn
vault B {
  label      "42 CFR Part 2 / HRT / sensitive"
  recovery   none            # unrecoverable by design
  opens      explicit_only
}
```

### `entity` — the shared nouns

```irn
entity Record {
  id       Ulid
  client   Ref(Client)
  kind     Enum(health, legal, part2, hrt)
  body     Ciphertext  @phi @aad(client.id)
  vault    Enum(A, B)
}
```

Types: `Ulid`, `Text`, `Int`, `Bool`, `Timestamp`, `Ciphertext`, `Enum(...)`,
`Ref(Entity)`.

Annotations: `@identity`, `@pii`, `@phi`, `@quasi_identifier`, `@count`,
`@aad(path)`, `@denominated(unit)`.

An **unknown annotation is an error**, not a no-op. `@denominatd(hours)` would
otherwise leave a field outside the convertibility check while the file still
read as if it were covered — a guardrail that stops applying with nothing
failing is the one outcome this language exists to prevent.

### `boundary` — where data may travel

```irn
boundary phi {
  never_leaves  device
  deny   sink(cloud, p2p, telemetry, sms, analytics)
  allow  sink(local_disk) when encrypted
  require encryption(aes_256_gcm)
}
```

`deny` always beats `allow`. An `allow ... when x` only applies if the caller
asserts `x`. Anything not explicitly allowed is denied.

### `policy` — the rules

```irn
policy aggregation {
  min_cell_size    5
  on_below_floor   suppress
  on_uncertain     suppress
  deny             rounding
}

policy hive_admission {
  deny     person_identifying
  require  source_count >= 5
}

policy commons_scope {
  denominations   [hours, dollars]
  forbid  convert(hours, dollars)
  forbid  convert(dollars, hours)
  forbid  identity_field(legal_name, address, date_of_birth, ssn, ...)
}
```

`commons_scope` is the Commons' two-rail wall. Hours are mutual credit and
dollars are aid IRN already holds; neither converts into the other, and no
entity may declare a KYC identity field. The validator enforces both
structurally: an entity carrying two `@denominated` units **is** a conversion
record, and a field named on the `identity_field` list warns wherever it
appears — including on Sanctuary entities, because the rule is "IRN does not
collect this", not "the Commons does not". Runtime enforcement lives in
[`src/utils/commonsScope.js`](../utils/commonsScope.js), which reads the list
from here and refuses to load against an empty one.

## Two severities, on purpose

| Severity | Meaning | Example |
|---|---|---|
| **error** | The program is malformed. Always fatal. | typo'd verb, `Ref` to an unknown entity, `@aad` to a missing field |
| **warning** | It parses but **weakens a core invariant**. | `min_cell_size 3`, vault B given a recovery path, `phi` allowing a network sink |

`conformance.test.js` asserts **zero errors and zero warnings**. That encodes the
governance rule from `CLAUDE.md` exactly: weakening an invariant is possible, but
only by deliberately editing a test — never by quietly editing a value.

A typo'd verb is an *error*, not a warning, because a silently-ignored directive
is a guardrail that isn't running.

## Using it at runtime

```js
import { sinkAllowed, cellEmittable, quasiIdentifiersOf } from './irnl/evaluate.js';

sinkAllowed('phi', 'cloud');                             // false
sinkAllowed('phi', 'local_disk', { conditions: ['encrypted'] });  // true
cellEmittable(4);                                        // false
quasiIdentifiersOf('Client');   // ['jurisdiction','demographic','timeframe']
```

Everything defaults **closed**: an unknown boundary, an unknown sink, an
undeclared policy, or a non-finite count all deny. "Uncertainty → silence" is the
house rule, so an absent rule must never read as permission.

## Layout

| File | Role | Pure? |
|---|---|---|
| `lexer.js` | source → tokens | yes |
| `parser.js` | tokens → AST | yes |
| `validate.js` | semantic checks, two severities | yes |
| `compile.js` | AST → program model | yes |
| `spec.js` | loads the canonical spec (`?raw`) | yes |
| `evaluate.js` | policy runtime | yes |
| `codegen/index.js` | TS / Rust / Python emitters | yes |
| `cli.js` | the only module that touches the filesystem | no |

Pure modules import cleanly in the browser, in Vitest, and in Node.

## Generated output

| Target | Path | Consumer |
|---|---|---|
| TypeScript | `src/types/irn.generated.ts` | TS consumers (e.g. the Tauri twin app) |
| Rust | `src-tauri/src/irn_generated.rs` | the Tauri shell |
| Python | `src/irnl/generated/irn_types.py` | Zee Zee / Amina / hive tooling |

Never hand-edit these; `npm run irnl:build` rewrites them, and a stale file fails
the suite.

## Changing an invariant

1. Edit `spec/irn.irn`.
2. `npm run irnl:build`.
3. `npm test` — conformance will tell you exactly what disagrees.
4. If you genuinely intend to weaken a guardrail, change the conformance test
   too, deliberately, with Aziza's sign-off. That edit is the audit trail.
