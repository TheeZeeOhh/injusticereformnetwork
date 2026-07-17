# Sanctuary — Runtime Verification Record

**Date of session:** 2026-07-12
**Build verified:** commit `c6f7159` (branch `sanctuary-app`)
**Environment:** Linux (hardened kernel), XFCE, native Tauri desktop build
(`src-tauri/target/release/app`), real WebKitGTK webview.
**Method:** Manual, operator-driven testing of the built desktop binary on real
hardware — not automated tests. A physical USB stick (PNY, `154b:1009`) was used
as the dead-man's-switch token.

> This document records what was **executed and observed live**, versus what
> remains **unverified**. It exists so the distinction is durable and auditable,
> not buried in a chat log. It is NOT a security audit and does not replace the
> independent review required before real PHI (see `SECURITY-AUDIT.md`).

---

## Why this record matters

The automated suite (104 tests as of this commit) runs in Node with
`fake-indexeddb` and a shimmed WebCrypto. It **cannot**, by construction, verify:
the OS keychain, real IndexedDB persistence, the WebKitGTK webview rendering, or
the USB hardware poll thread. Those require a real desktop session. This session
provided that, and the results below are the first hardware confirmation of the
app's core security behaviors.

---

## Verified live on real hardware (executed, observed)

| # | Behavior | What was observed | Why tests could not cover it |
|---|----------|-------------------|------------------------------|
| 1 | **App builds, launches, renders, is navigable** | Native binary launched, webview rendered the React UI, pages navigable | No webview in Node |
| 2 | **Map renders in the webview** | Leaflet + OpenStreetMap map displayed with Baltimore resource pins and popups | No DOM/webview/tiles in Node |
| 3 | **MAT auto-routes to Vault B** | Typing a MAT medication (Suboxone) auto-flagged the record sensitive and showed the "42 CFR Part 2 → Vault B" notice | UI/interaction, not unit-testable here |
| 4 | **Data persists across a full cold restart** | Process fully killed, relaunched cold; logged back in; the Suboxone record (`PT-8942`, Vault B) was still present after unlocking Vault B | No OS keychain or real IndexedDB in Node |
| 5 | **Keychain round-trip** | Cold start showed the Login screen (not Onboarding), i.e. the vault verifier/salts were found in the OS keychain | No keychain in Node |
| 6 | **Independent Vault B passphrase** | Vault B stayed closed after login; opened only with its separate passphrase; sensitive record decrypted correctly under it | Real key lifecycle, not unit-testable here |
| 7 | **USB dead-man's switch — arm** | Scan listed USB devices as a styled, labelled, selectable list; arming to `154b:1009` returned the "ARMED … Removal will wipe session keys" confirmation | No USB bus in Node |
| 8 | **USB dead-man's switch — fire** | Physically removing the token produced (within ~1s) the "USB security token removed. All vault keys have been dropped from memory." alert and closed Vault B | No USB bus / poll thread in Node |
| 9 | **Wipe-not-destroy (recovery)** | After the wipe, re-entering the Vault B passphrase restored access to the Suboxone record — the switch clears keys from RAM, it does not delete data on disk | Requires the full encrypt→persist→wipe→re-auth cycle on real storage |

**Significance:** items 4, 5, 8, and 9 were the highest-risk, previously-unverified
paths (the README explicitly flagged keychain round-trip and USB removal→wipe as
unconfirmed). Together they demonstrate the app's core promise end-to-end:
data is **encrypted, persistent, separately-keyed (Vault B), panic-protected,
and recoverable** — shown on hardware, not merely claimed.

---

## Bug found and fixed during this session

- **Empty USB device picker (fixed in `c6f7159`).** Live testing revealed that
  "Scan USB" reported devices found, but the native `<select>` rendered no
  selectable options in the WebKitGTK webview (native `<option>` elements render
  invisibly), leaving Arm disabled. Replaced with a styled button list and added
  readable "vid:pid — Manufacturer Product" labels. Re-verified live (items 7–9
  above were performed with the fix). This bug was **structurally invisible to
  the automated suite** and only surfaced through hardware testing.

---

## NOT verified (still open — do not overstate)

- **Independent security audit** — NOT done. This remains the hard gate before
  any real client PHI. Runtime behavior working is not the same as the
  cryptography being audit-proven.
- **Cross-machine backup restore** — NOT tested (requires a second machine).
  The backup create/restore round-trip is unit-tested only.
- **USB switch cryptographic strength** — the switch works, but it watches a
  `vid:pid` presence, which is spoofable. It is a convenience/panic mechanism,
  NOT cryptographic hardware-binding. True hardware binding is designed but not
  built (`docs/model2-hardware-vault-b.md`).
- **Deferred hardening** — Argon2id KDF (H2), device-origin backup signing (M3),
  and deterministic key zeroization / Model 2 (M4) remain deferred with written
  designs. See `SECURITY-AUDIT.md`.
- **Full end-to-end QA of every module** — only the paths above were exercised.
  Many modules were viewed but not exhaustively tested.

---

## Bottom line

As of 2026-07-12 (`c6f7159`), Sanctuary's core security behaviors —
local encryption, persistence across restart via the OS keychain, real
dual-vault separation, and the hardware panic wipe with safe recovery — are
**verified on real hardware**, in addition to a 104-test automated suite. The
remaining distance to production readiness is the **independent security audit**
and cross-machine QA, neither of which has been done. Do not enter real client
PHI until the independent review is complete.
