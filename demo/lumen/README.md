# Lumen

A small dynamically-typed programming language, implemented end-to-end as a
self-contained demo. **Unrelated to Sanctuary's crypto/vault code** — it lives
here only as a worked example of a fully test-verified interpreter + VM.

## Pipeline

```
source ──▶ lexer ──▶ parser ──▶ ┬─▶ tree-walking interpreter ──▶ value
                                 └─▶ bytecode compiler ──▶ stack VM ──▶ value
                                            │
                                            └─▶ disassembler ──▶ listing
```

- `src/lexer.js` — source → tokens
- `src/parser.js` — Pratt parser → AST (precedence, closures, calls, indexing, `if`/`while`, arrays)
- `src/interpreter.js` — tree-walking evaluator (lexical scope, closures, recursion)
- `src/opcodes.js` — bytecode opcodes + `Chunk` + `FnProto`
- `src/compiler.js` — AST → bytecode (local slots, upvalue capture, jump patching)
- `src/vm.js` — stack VM (call frames, boxed upvalues, builtins)
- `src/semantics.js` — value semantics shared by interpreter + VM (single source of truth)
- `src/disassembler.js` — bytecode → human-readable listing

## Language features

`let`, assignment, `fn` (first-class + closures), `if`/`else`, `while`, `return`,
arithmetic/comparison/logic (`and`/`or` short-circuit), arrays + indexing,
builtins (`print`, `len`, `push`, `str`, `int`), `#` comments.

## Tests

Run from the repo root (Lumen tests are included in the repo's Vitest suite):

```bash
npx vitest run demo/lumen
```

Coverage: language behavior, a **differential suite** asserting the VM produces
identical results to the tree-walking interpreter on every program, and
disassembler output checks. The differential design means a bug in either engine
is caught by disagreement with the other.
