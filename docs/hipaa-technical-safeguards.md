# Sanctuary — HIPAA Security Rule Technical Safeguards: Gap Analysis

**Status:** Engineering gap analysis, NOT a compliance certification or legal
determination. It maps HIPAA Security Rule **technical safeguards**
(45 CFR §164.312) to what the Sanctuary code actually does, tagged VERIFIED
(confirmed in source, file:line) or GAP. Administrative (§164.308) and physical
(§164.310) safeguards are org-level and mostly OUT OF SCOPE here — noted where
they gate the technical claims.

**A HIPAA-compliant *application* does not exist.** Compliance is a property of
**IRN as a covered entity / business associate** — risk assessment, BAAs,
policies, training, breach procedures — of which software safeguards are one part.
This document supports a real §164.308(a)(1) risk analysis; it is not one.

Get a qualified HIPAA compliance professional to perform the actual assessment
before representing compliance to any client, funder, or regulator.

---

## §164.312(a)(1) Access Control

- **(a)(2)(i) Unique user ID** — PARTIAL. Login is passphrase-based
  (`authStore.js`); vault keys derive from the passphrase. There is a per-user
  login, but access is ultimately gated by knowledge of the vault passphrase,
  not a per-user credential store with individual accountability. GAP: confirm
  whether multi-user accountability is required for IRN's workforce.
- **(a)(2)(ii) Emergency access procedure** — GAP / INCIDENT. On 2026-07-21 a
  portable-USB `records_and_salts` eject cleared the resident keychain salts and
  ORPHANED a vault (records intact, undecryptable, operator locked out). Fixed in
  commit 71de329 (confirmation gate + restore-verify + no keychain touch), but
  this is a documented AVAILABILITY failure that a risk assessment must record.
  There is no formal emergency/break-glass access path; Vault B is unrecoverable
  by design (no escrow) — a deliberate trade-off that must be acknowledged.
- **(a)(2)(iii) Automatic logoff** — GAP: verify whether an idle-timeout logoff
  exists; the USB dead-man's switch wipes RAM keys on token removal
  (`src-tauri/src/lib.rs` arm/disarm), which is stronger than timeout but is a
  different control.
- **(a)(2)(iv) Encryption/decryption** — VERIFIED. AES-256-GCM, 256-bit keys,
  PBKDF2 600k iterations, non-extractable (`cryptoEngine.js:217-238`, `:436`).
  Records at rest are ciphertext; IndexedDB inspection confirmed no plaintext PHI
  (only record IDs are plaintext keys — a metadata leak, see below).

## §164.312(b) Audit Controls

- VERIFIED. `auditLog.js` maintains a **hash-chained, tamper-evident** log:
  every vault read/write/delete appends `hash = SHA-256(prevHash + ts + sealed)`,
  the payload is SEALED (AES-GCM, RAM-only key from `deriveAuditKey`), and
  `verifyChain()` detects any alteration/deletion. Serialized append queue
  prevents chain forks. This is a strong §164.312(b) foundation.
- GAP: confirm the audit log captures ENOUGH — HIPAA expects access attempts,
  not just successful ops; and log retention/review procedures are org-level.

## §164.312(c) Integrity

- **(c)(1)/(c)(2) Mechanism to authenticate ePHI** — VERIFIED. v2 record envelope
  binds records with AAD `(vaultTag, recordId)` (`cryptoEngine.js:403-458`); a
  relocated/replayed blob fails the GCM auth tag. Backups are HMAC-signed
  (`backupEngine.js`), tamper-detectable on restore.
- GAP (test candidate, not confirmed exploitable): a v2->v1 downgrade / AAD-strip
  path in `decryptRecord` (`cryptoEngine.js:465-475`) — see docs/pentest-plan.md.

## §164.312(d) Person or Entity Authentication

- VERIFIED (mechanism). An encrypted verifier blob challenges the passphrase via
  AES-GCM auth (`cryptoEngine.js:278-366`); a wrong passphrase fails before any
  record is touched. Vault A/B are independently keyed.
- GAP: single-factor (passphrase). Biometric MFA is a Tauri plugin but MOBILE
  ONLY (not the desktop/kiosk build). Consider a hardware token as a 2nd factor.

## §164.312(e) Transmission Security

- Local-first: most data never transmits. VERIFIED egress paths are narrow:
  - `fetch_model_file` — HuggingFace host allowlist (`lib.rs:162-195`).
  - `hosted_assistant_ask` — Anthropic, key server-side, host-allowlisted, gated
    by `routeEngine.js`/`guardrails.js` (default-closed; PHI/referent -> local).
  - `send_sms_reminder` — Twilio. **GAP (PHI EGRESS):** the SMS body is operator
    free-text (`ClientsModule.jsx:35,265`) with NO PHI/referent guardrail (unlike
    the AI path). A reminder containing a client name/case number is a PHI
    disclosure to Twilio, a third party.

## Cross-cutting GAPS that a §164.308 assessment must address

1. **Business Associate Agreements.** `hosted_assistant_ask` sends to **Anthropic**
   and `send_sms_reminder` to **Twilio**. Both are third parties that would handle
   IRN data. HIPAA requires a signed **BAA** with each before ANY PHI (even
   indirectly) flows there. Until a BAA exists: block PHI from these paths.
   - Note: Anthropic STANDARD tier is transient-retention, not ZDR — the routing
     layer keeps referent-bearing text local, but a BAA is still required for the
     vendor relationship.
2. **SMS PHI guardrail.** `send_sms_reminder` needs a referent/PHI content check
   (being added) OR must be restricted to the non-PHI default template.
3. **Record-ID metadata leak.** IndexedDB stores record IDs (e.g. `client_PT-8942`)
   in plaintext as primary keys. Values are encrypted; IDs reveal existence/count
   of clients. Low severity, pre-existing, worth documenting.
4. **Written risk analysis (§164.308(a)(1))** — DOES NOT EXIST. This doc + the
   pentest plan are inputs, not the required formal risk analysis.
5. **Administrative safeguards (§164.308)** — security officer, workforce
   training, sanction policy, contingency plan, incident response — org-level,
   not in code, must be documented separately.
6. **Physical safeguards (§164.310)** — device/media controls; the labwc kiosk
   and USB dead-man's switch are relevant but need documented procedures.

## Honest summary

Sanctuary's technical architecture is a **strong foundation** for the Security
Rule — arguably stronger than typical cloud EHRs on encryption at rest, breach
minimization, and audit integrity. But:

- The app **is not, and cannot be, "HIPAA compliant" on its own.**
- Concrete technical gaps to close: SMS PHI guardrail, BAAs (or block PHI egress),
  and documenting the 2026-07-21 availability incident.
- Compliance for **IRN's use** additionally requires the administrative/physical
  safeguards and a formal risk analysis, none of which live in this repo.
