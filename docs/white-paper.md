# Sanctuary: A Local-First, Client-Side-Encrypted Records Platform for Justice and Health Advocacy

**A white paper from the Injustice Reform Network (IRN)**
501(c)(3) · EIN 83-4207890

---

## Abstract

Sanctuary is a health-and-legal records application built for organizations that
serve people whose safety depends on their records staying private — including
formerly incarcerated people, transgender clients, and others navigating the
justice, health, and benefits systems. Unlike conventional cloud software,
Sanctuary is **local-first and client-side-encrypted by design**: client data is
encrypted on the device before it is stored, keys are held only in memory, and no
readable client health information leaves the machine. Its core design goal is a
**Technical Incapacity Defense** — the operator should be structurally unable to
produce readable client records under subpoena, because the plaintext simply does
not exist anywhere it could be seized.

This paper describes the problem Sanctuary addresses, its architecture, its
verifiable security properties, and — importantly — its honest limits and the
organizational safeguards that any deployment still requires.

---

## 1. The problem

Advocacy organizations that hold sensitive records face a structural conflict.
The people they serve are often those most harmed by data exposure: a subpoena, a
breach, a hostile subpoena of a *vendor*, or a single misconfigured cloud bucket
can expose immigration status, gender-affirming care, substance-use treatment
(protected under 42 CFR Part 2), or the details of an open legal matter. For these
populations, a data breach is not an inconvenience — it can mean deportation,
loss of custody, violence, or criminal exposure.

Conventional software makes the *organization* the custodian of readable data.
Even encrypted-at-rest cloud services typically hold, or can compel, the keys.
That custody is exactly the liability. Sanctuary starts from a different premise:
**the safest data is the data the operator cannot produce.**

---

## 2. Design principles

1. **Local-first.** Client protected health information (PHI) lives on the
   device. There is no cloud sync, no peer-to-peer replication of client data,
   and no telemetry carrying client information.
2. **Client-side encryption.** All records are encrypted before storage using
   AES-256-GCM. The encryption happens in the application, not on a server.
3. **Keys in RAM only.** Encryption keys are derived from the operator's
   passphrase and held in memory; they are never persisted to disk, logs, or
   application state.
4. **Technical Incapacity.** Because plaintext and keys exist only transiently in
   memory on an unlocked device, the operator cannot hand over readable client
   PHI from a locked or seized machine.
5. **Verification over assertion.** Security-critical behavior is covered by an
   automated test suite (312 tests at time of writing) and a verification-first
   engineering discipline — a reported result is not trusted until it has been
   independently executed.

---

## 3. Architecture

Sanctuary is a desktop application built with **Tauri** (a Rust-based native
shell) and a **React** frontend. This gives it a small, auditable native surface
and a modern UI without a browser dependency.

### 3.1 Encryption and key management

- **Cipher:** AES-256-GCM (authenticated encryption) for all records.
- **Key derivation:** PBKDF2 with **600,000 iterations** and SHA-256, producing
  non-extractable 256-bit keys — the raw key bytes never enter the application's
  memory heap.
- **Identity binding:** each record's ciphertext is authenticated against its
  slot (vault + record identifier) as Additional Authenticated Data, so a record
  cannot be silently relocated or replayed into another slot.

### 3.2 Two independent vaults

Sanctuary separates ordinary records (Vault A) from especially sensitive material
such as 42 CFR Part 2 / gender-affirming-care data (Vault B). The two vaults are
keyed from **independent passphrases and distinct salts** — a holder of the
Vault A passphrase alone cannot derive Vault B. Vault B stays closed until
explicitly unlocked and is **unrecoverable by design**: there is no escrow and no
reset, so a forgotten Vault B passphrase means the data is permanently
inaccessible. This is a deliberate trade-off favoring confidentiality over
recoverability for the most sensitive tier.

### 3.3 Tamper-evident audit log

Every vault read, write, and delete appends an entry to a **hash-chained audit
log** (`hash = SHA-256(previous hash + timestamp + sealed payload)`). Altering or
deleting any past entry breaks the chain, which a verification pass detects. The
log payloads are themselves sealed with a RAM-only key, so the log records *that*
access occurred without disclosing *which* records were touched.

### 3.4 Hardware dead-man's switch

An optional USB hardware token can be bound to a session. When the token is
removed, the application wipes session keys from memory — turning physical
separation from the token into immediate cryptographic lock-down.

### 3.5 Narrow, allowlisted egress

Sanctuary is local-first, but a few carefully bounded network paths exist and are
enforced in the native (Rust) layer, not the webview:

- On-device AI transcription downloads models from an allowlisted host only.
- A hosted-assistant path is available **only** for generic, referent-free
  bureaucracy questions, gated by a default-closed routing layer that keeps
  anything client-specific local.
- SMS reminders are relayed via a provider, with a deterministic content guard
  that blocks any message appearing to contain PHI (names, case numbers, dates of
  birth, health details) before it can leave the device.

### 3.6 Privacy-preserving aggregation

For reporting and grant statistics, Sanctuary enforces a **k-anonymity floor**:
any aggregate cell — including combinations of quasi-identifiers such as
jurisdiction + demographic + timeframe — is suppressed if it represents fewer
than five people. A count of one is that person's record; the system emits
nothing rather than risk re-identification.

---

## 4. What Sanctuary is *not*

Credibility for a privacy tool depends on honesty about its boundaries. Sanctuary
does **not** claim to be:

- **A HIPAA-compliant product by itself.** HIPAA compliance is a property of the
  *organization* — its risk analysis, business-associate agreements, workforce
  training, and physical safeguards — not of software alone. Sanctuary provides
  strong technical safeguards that *support* compliance; it does not constitute
  it. A separate technical-safeguards gap analysis documents this honestly.
- **Protection against a compromised host.** Because encryption happens in the
  application and keys live in RAM while unlocked, malware or a malicious local
  actor on an already-unlocked machine remains a threat. Sanctuary defends the
  data at rest and in transit, and while locked — not against a fully
  compromised, running, unlocked endpoint.
- **A finished, audited system.** The codebase is under active development and
  has not undergone an independent third-party security audit. Its security
  documentation is written to remain honest, and claims are backed by tests, but
  external review is a necessary future step before high-stakes reliance.

---

## 5. Verification discipline

Sanctuary is built under a "verification-first" rule: a reported result is a
claim, not a fact, until it has been independently executed. Security-critical
changes must keep the existing test suite green, and new behavior is added with
tests rather than by loosening them. This discipline has already caught real
defects — including, during development, an availability failure in an
experimental portable-USB feature that was diagnosed, fixed, and documented rather
than hidden. That transparency is itself part of the security posture: a privacy
platform that hides its incidents cannot be trusted.

---

## 6. Who it's for

Sanctuary is built for mission-driven organizations serving vulnerable people,
where the cost of exposure is measured in human safety rather than dollars:
reentry and legal-aid programs, LGBTQIA+ health and advocacy organizations, and
community groups navigating fragmented court, health, and benefits systems on
behalf of clients who cannot afford a leak. It is designed to run on ordinary
hardware, including shared or field devices, and to leave nothing readable behind.

---

## 7. Conclusion

Sanctuary inverts the usual custody model: instead of asking an organization to be
a trustworthy holder of readable client data, it removes the readable data from
the places it could be seized. The result is a platform whose privacy guarantees
are architectural, not merely policy — encrypted at rest, keys in RAM,
subpoena-resistant by design — and whose limits are stated as plainly as its
strengths. For the people IRN serves, that combination of real technical
protection and honest disclosure is the point.

---

*Injustice Reform Network — civic-technology platform for accountability,
organizing, and justice. This document describes an actively developed system and
is not a security certification. Independent review is recommended before
high-stakes deployment.*
