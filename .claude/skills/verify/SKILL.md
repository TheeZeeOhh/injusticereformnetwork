---
name: verify
description: Run the verification-first checklist before trusting or reporting any result. Use when finishing a task, when a test/build/command "passed", when a result looks suspiciously good, or before telling Aziza something works. Enforces "a reported result is not a verified result."
---

# /verify — verification-first checklist

The discipline: **never trust a reported result you did not cause to run and read.**
This is the gate that catches the untested change before it lands. Work through
every step; do not skip because a result "looks right."

## 1. Did code actually execute?
- Did you *run* it this session, or are you inferring from reading/reasoning?
- Reading code is not running it. "Should pass" / "looks correct" / "returns X"
  are hypotheses, not results.
- If it didn't execute, run it now and read the **actual** output — not the
  summary line, the real output.

## 2. Suspiciously good = probably bugged
Treat any of these as a bug until proven otherwise:
- Passed instantly / far faster than expected.
- Zero failures on the first try for non-trivial work.
- A perfect match, a round number, an empty diff where you expected change.
- The task was easier than it should have been.

Common culprits to rule out: wrong file/path, tests silently skipped (0 tests
run still exits 0), a stubbed/mocked path masking the real one, a cached result,
a no-op that never reached the code you changed.

## 3. Trace one real example end to end
- Pick ONE concrete input.
- Follow it through the **actual** code path that will run in production — not a
  mental model of it.
- Confirm the actual output at the end. If you can't trace it, you don't
  understand it yet.

## 4. Independent sanity check
Confirm the result a **second way that doesn't share the first method's
assumptions**:
- Different input (including an edge/adversarial one).
- Inverse operation (encrypt→decrypt round-trip, write→read-back).
- A direct read of the resulting state (DB row, file contents, RAM key presence).
- A count or invariant that must hold.

## 5. For this codebase specifically
- **Crypto/vault changes:** run the full suite (`npm test`) and read the pass
  count — do not trust "tests pass." Confirm vault A/B separation and
  AAD-identity binding tests are among those that ran, not skipped.
- **Storage changes:** round-trip a real record (write encrypted → read back →
  decrypt) rather than trusting a unit test in isolation. The untested
  storageEngine change is the exact failure this step exists to catch.
- **Anything touching PHI paths:** confirm no plaintext client data is written to
  disk, logs, or state on the path you changed.

## 6. Report honestly
State what you actually verified and how — and what you did NOT verify. If a
result is unconfirmed, say so plainly. "I ran X, read output Y, and cross-checked
with Z" beats "it works."

> If the work is being shipped (not just checked), continue with `/ship` — verification
> is one link in the chain, not the whole chain.
