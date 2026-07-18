---
name: ship
description: Run the full ship gauntlet before declaring any work shipped or done. Use when Aziza says ship it / done / finish / deploy, or when wrapping up a change. Enforces test → lint → build → commit → push → runtime verification, and REFUSES to declare shipping complete until runtime confirmation is provided.
---

# /ship — the ship gauntlet

**"Done" means the whole chain ran, not "I wrote the code."**

```
test → lint → build → commit → push → runtime verification
```

Do not truncate it. Work top to bottom. Each stage must actually pass (read the
real output — see `/verify`) before moving on.

## The chain

1. **Test** — `npm test`. Read the pass count and confirm the relevant tests
   actually ran (not skipped). Crypto/vault work: confirm those suites are green.
2. **Lint** — `npm run lint`. Errors block. (Warnings are non-blocking today; do
   not silently introduce new ones.)
3. **Build** — the real build for what's shipping (`npm run build`, or
   `npm run tauri build` for the desktop app). A build that fails is not shippable.
4. **Commit** — **GATED.** Never commit on your own initiative. Stage files,
   draft the message, then STOP and wait for Aziza's explicit go-ahead. The
   `.githooks/pre-commit` gate will re-run test+lint mechanically.
5. **Push** — **GATED, same as commit.** Only on Aziza's explicit instruction.
6. **Runtime verification** — see the refusal gate below.

## Runtime refusal gate (the point of this skill)

**A built binary is NOT a verified binary.** Building proves it compiles/bundles.
It does NOT prove it runs correctly on the real target.

Therefore: **do NOT declare work "shipped," "done," or "complete" while runtime
verification is pending.** Compiling is not confirming.

Runtime verification means the thing was actually exercised on its real target and
observed working — for this project that includes:
- **The labwc kiosk boot** — the app launches fullscreen and is usable on the box.
- **The CSP gauntlet** — Content-Security-Policy actually holds at runtime without
  breaking the app (this has been "the next step" for multiple sessions — it is
  a real, outstanding blocker, not a formality).
- Any feature-specific runtime check for what changed (keychain round-trip on a
  live desktop session, USB dead-man's-switch removal, IndexedDB persistence).

**If runtime verification has not been done, you MUST:**
- Explicitly state that shipping is **NOT complete**.
- Name the specific outstanding runtime step(s) — by name (e.g. "CSP gauntlet
  still pending on the labwc box").
- Describe everything that IS confirmed (test/lint/build/commit status) so the
  remaining gap is precise, not vague.

The skill cannot perform the runtime check for you — that's Aziza (or you) on the
real target. What it does is make "unverified at runtime" a **blocking, named
state** instead of a silent omission. That is the whole job.

## Only after runtime is confirmed
When — and only when — runtime verification is done and observed passing, you may
report the work shipped. State what was verified at runtime and how.
