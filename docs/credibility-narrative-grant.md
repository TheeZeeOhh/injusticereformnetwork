# Sanctuary — Security & Stewardship Summary (for Funders)

*A plain-language summary for grant officers and foundation program staff. It
describes how Sanctuary protects the people it serves, what independent
verification still lies ahead, and how grant funds would responsibly move the
project to its next milestone. It is written to be candid about limits as well as
progress — the same standard the project holds itself to.*

---

## In one paragraph

Sanctuary is a tool for the Injustice Reform Network's Navigators — the people who
work directly with individuals facing incarceration, substance-use recovery,
gender-affirming care, and legal jeopardy. It keeps those clients' most sensitive
records encrypted on the Navigator's own device, so that the information cannot be
handed over in readable form under legal pressure. Recently, the project's
security was examined critically and hardened: the most serious weaknesses —
including one where a key protection for the most sensitive records was not
actually working as promised — were corrected and are now backed by an automated
testing system that did not exist before. The project is honest about what remains:
an **independent, third-party security audit** is the next milestone before any
real client information is entered. This summary describes the progress made, the
verification still needed, and how funding would responsibly close that gap.

---

## Who this protects, and why it matters

The Network's clients are among the most surveilled and legally vulnerable people
in the communities IRN serves. For them, a data breach or a subpoena is not an
abstract IT risk — it can mean loss of care, loss of custody, re-incarceration, or
exposure of gender-affirming or substance-use treatment. Protecting that data is
not a technical nicety; it is a direct extension of the Network's mission to
reduce harm to people the system already treats unjustly.

Sanctuary's design goal is simple to state: **a Navigator should not be able to
be compelled to produce readable client records**, because the records are
encrypted and the keys exist only briefly, in memory, while the Navigator is
actively working. That is the promise. The recent work was about making sure the
promise is true in practice, not just on paper.

---

## What was done, in plain terms

The project commissioned an internal, adversarial review of its own security —
deliberately trying to break its protections — and then fixed what it found.

- **The most sensitive records are now genuinely walled off.** The system keeps a
  separate, higher-protection space for the most sensitive data (substance-use
  and gender-affirming-care records governed by federal confidentiality law).
  The review found that this separation was not actually holding — the extra
  protection could be bypassed. **It has been fixed** and is now verified to work.
- **Records can no longer be tampered with undetected.** A weakness that could
  have let stored records be swapped or altered without detection was closed.
- **Weak passwords are now refused, and setup is safer**, closing gaps that could
  have led to lost data or unauthorized access.
- **A safety net now exists where there was none.** The project went from having
  **no automated testing** to a suite of **83 automated checks** that re-verify
  the core protections every time the code changes — the software equivalent of a
  standing internal control.

The project is equally clear about what it deliberately *deferred* rather than
rushed: a small number of advanced hardening measures were designed and
documented but left for the independent audit to specify, because an outside
expert should set those details. Nothing was quietly left unaddressed — every
issue is either fixed, planned with a written design, or documented as acceptable.

---

## Responsible stewardship: what has NOT been done

Foundations rightly ask what they are *not* being told. This project's answer:

- **It has not yet had an independent, third-party security audit.** The work so
  far is a rigorous internal review. An external audit remains the required gate
  before any real client data is used, and the project says so plainly in its own
  public documentation.
- **It is not yet in use with real clients**, and its desktop features have not
  been tested on real hardware in a live session.
- **This is a strong prototype, not a finished product.** No claim of "done" or
  "certified" is being made.

Stating these limits is not a weakness in the case for funding — it is evidence of
the disciplined, honest engineering culture that makes the project worth funding.

---

## Why now is the right moment to invest

The security work moved Sanctuary from *"a promising tool whose central protection
did not fully work"* to *"a credible early-stage system with its core protections
fixed, tested, and honestly documented."*

That matters for a funder because it makes the **next dollar highly efficient.**
An independent security audit is far cheaper and faster when the obvious problems
are already fixed and the code is already tested — the auditor spends their time
on depth, not on catching basic gaps. In other words, the groundwork that
de-risks an audit has already been done at no cost to the funder.

---

## What funding would accomplish (the concrete milestone)

Grant support at this stage would fund the **specific, verifiable milestone that
unlocks real-world use:**

1. **An independent, third-party security audit** — the gate that must be cleared
   before any real client PHI is entered. This is the single highest-leverage
   investment in the project's safety.
2. **Runtime verification on real hardware** — confirming the desktop protections
   (secure key storage, the hardware "dead-man's switch") behave correctly in a
   live environment.
3. **Completing the documented advanced hardening** — a set of already-designed
   improvements to further strengthen protection against device seizure.

Each of these is a discrete, checkable deliverable with a clear "done" state — the
kind of milestone a foundation can fund, verify, and report on. The result of
completing them is a system that IRN Navigators can safely use to protect the
people the Network exists to serve.

---

## Verification for interested reviewers

Everything above is backed by artifacts a technical reviewer (or a funder's
technical advisor) can inspect directly: a written security findings report, the
83-test automated suite, a traceable change history where each fix is tied to a
specific finding, and design documents for the deferred work. The project is built
to be checked, not merely trusted.
