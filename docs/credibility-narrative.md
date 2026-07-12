# Sanctuary — Security Credibility Narrative

*A stakeholder-facing summary of the security posture, for funders, the IRN
board, and technical due-diligence reviewers. It is deliberately honest about
both what has been done and what has not — the same standard the product itself
is built on.*

---

## One-paragraph version

Sanctuary is a local-first, encrypted health & legal records app whose core
promise is a **Technical Incapacity Defense**: the operator cannot produce
readable client PHI under subpoena because it is never stored in plaintext and
keys live only in RAM. That promise was recently put through an adversarial
internal cryptography review. The two most serious findings — including one where
the headline "dual vault" protection did not actually hold — were **fixed and
covered by an automated test suite (83 tests, from a starting point of zero).**
The remaining findings are either fixed, deferred with a written engineering
design, or documented as acceptable at the current scale. The result is a
prototype with a **real, tested security foundation and an honest, auditable
roadmap** — the state you want to be in *before* commissioning the independent
review that a PHI system requires.

---

## Why this matters (the honest frame)

For a system that holds substance-use, gender-affirming-care, and legal records
for vulnerable people, the security story is not a feature — it *is* the product.
A claim like "we can't be compelled to hand over readable data" is either true at
the cryptographic level or it is a liability. This document exists to show that
the claim has been tested against an adversary's eye and hardened, not just
asserted in marketing copy.

Crucially, this narrative does **not** claim the system is audited or
production-ready. It claims something narrower and more defensible: the
foundation is now real, legible, and ready for the external validation that comes
next.

---

## What was found, and what was done

An internal review examined the cryptography adversarially and produced a written
findings report (`SECURITY-AUDIT.md`). Highlights:

### The two critical issues — fixed
- **Dual-vault separation was cosmetic.** Both "vaults" were derived from a
  single passphrase, so closing the sensitive vault ("Vault B" — 42 CFR Part 2,
  HRT data) provided no real protection: anyone with the login passphrase could
  reopen it. **Now:** Vault B is keyed on an *independent* passphrase, stays
  closed after login, and only opens on explicit unlock. "Panic close" is now
  cryptographically meaningful. This corrected a material gap between the product
  claim and the implementation.
- **Records were swappable.** Encrypted records were not bound to their identity,
  so ciphertext could be relocated or substituted between records undetected.
  **Now:** each record's vault + id is authenticated into the ciphertext (AAD);
  substitution fails cryptographically.

### The rest — fixed, deferred-with-a-plan, or accepted
- **Fixed and tested:** passphrase-strength enforcement (zxcvbn), safe
  enrollment (no silent re-enrollment over existing data), independent Vault B
  verification, and three lower-severity correctness/data-loss issues.
- **Deferred with written designs (in `docs/`):** a memory-hard KDF (Argon2id),
  device-origin backup signatures, and hardware-bound Vault B. These are the
  kind of parameters an independent audit sets, so deferring avoids rework.
- **Accepted with documentation:** a theoretical IV-collision that is unreachable
  at this application's scale, with the revisit trigger recorded in code.

Every finding is now resolved, deferred with a design, or accepted with a
documented rationale. Nothing was left silently open.

---

## The evidence a reviewer can check

This is not a self-assessment asking to be taken on faith. It is backed by
artifacts in the repository:

- **`SECURITY-AUDIT.md`** — the full findings report with severities and
  per-finding remediation status.
- **An automated test suite — 83 tests across 14 files** — covering the crypto
  core, storage, vault separation, backups, migration, enrollment safety, and the
  passphrase policy. (The codebase had **no tests at all** before this work.)
- **A traceable commit history** — 11 focused remediation commits, each mapping
  to a specific finding, with tests shipped alongside the fix.
- **Design docs in `docs/`** for the deferred hardening, so the roadmap is
  concrete, not aspirational hand-waving.

A technical due-diligence reviewer can clone the repo, run `npm test`, read the
audit, and verify these claims in under an hour.

---

## What this does NOT claim (read this before citing it)

Being explicit here is part of the credibility:

- **No independent security audit.** This was an internal review with the fixes
  written in-house. An external review remains the bar before real client PHI —
  the README states this plainly and it has not changed.
- **No production deployment, users, or runtime QA.** Desktop-only paths (OS
  keychain, USB token) are covered by unit/integration tests but have not been
  verified in a live desktop session.
- **This is not a valuation.** It is a statement of technical posture. What moves
  an actual valuation — an independent audit, a deployment, real users — lies
  outside the code and has not yet been done.

---

## Where this leaves us (the ask / the next gate)

The security work moved Sanctuary from *"a compelling prototype with a headline
protection that did not survive scrutiny"* to *"a credible pre-alpha with a real,
tested cryptographic foundation and an honest roadmap."*

That is precisely the state in which an **independent security review** becomes
worthwhile and efficient: the obvious issues are already fixed, the code is
tested, and the reviewer's time goes to depth rather than to catching a fake
dual-vault or the absence of a test suite. The recommended next steps, in order:

1. **Commission an independent cryptography/security review** (the gate for real
   PHI).
2. **Runtime-QA the desktop build** on real hardware (keychain, USB token).
3. **Execute the deferred hardening** (Argon2id KDF, device-origin signing,
   hardware-bound Vault B) — designs already written.

Only after (1) and (2) should real client PHI enter the system. Everything in
this document is oriented toward reaching that gate honestly.
