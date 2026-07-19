# Sanctuary — Static Security Review

**Date:** 2026-07-19
**Reviewer:** AI-assisted static read (not a certified audit)
**Scope:** Manual static review of the cryptographic core, the Tauri IPC surface,
storage/PHI-isolation flow, and dependency supply chain. Findings are tied to
actual source with file:line references.

> **This is NOT a formal audit.** It is a static code read. It does not include
> dynamic analysis (fuzzing/DAST), automated SAST, or manual cryptographic
> verification by a certified professional — all of which are still required
> before real client PHI. See [`pilot-readiness-checklist.html`](pilot-readiness-checklist.html),
> Gate A. A static read can only tell you whether the foundation is sound enough
> to be worth auditing. Here, it is.

---

## Summary

| Area | Finding | Severity |
| --- | --- | --- |
| Cryptographic core | Strong: PBKDF2-600k, non-extractable keys, per-record random IV with documented reuse analysis, AAD slot-binding + version-downgrade protection, cryptographic dual-vault separation | — (well-built) |
| Tauri IPC surface | Small (8 commands), no filesystem/exec/SQL sinks, outbound hosts allowlisted, PHI structurally excluded from the hosted path | — (well-built) |
| PHI isolation | Enforced at the IPC boundary by construction, not just by convention | — (well-built) |
| Supply chain | 3 HIGH advisories in `transformers → onnxruntime-node → adm-zip`, **not reachable** at runtime (Sanctuary uses onnxruntime-web/WASM) | LOW (dep hygiene) |
| KDF strength | PBKDF2, not Argon2id (GPU-friendly); memory-hard upgrade tracked | LOW (deferred, documented) |
| Ops / secrets | Backend commands read API creds from process env; a `.env` was leaked to git and remediated 2026-07-19 | MEDIUM (process/deploy hygiene) |

---

## 1. Cryptographic core — `src/utils/cryptoEngine.js`

**Strong, standards-aligned implementation.**

- **Key derivation** — PBKDF2-SHA256, **600,000 iterations**, keys created
  **non-extractable** (`extractable = false`, lines 217–238). The raw AES key
  bytes never enter the JS heap; there is nothing in JavaScript memory to zero
  out. Salts are per-install, non-secret, and stored in the OS keychain under
  Tauri (out of webview-accessible storage).
- **AES-256-GCM, random 96-bit IV per encryption** (`encryptRecord`, line 436).
  The code carries an explicit written analysis of the IV-reuse birthday bound
  (~2^32 encryptions/key) and why it is unreachable at this app's scale
  (lines 429–435) — the correct engineering call, documented, not hand-waved.
- **AAD slot-binding + downgrade protection** — `buildRecordAad(vaultTag, recordId)`
  binds each ciphertext to its exact (vault, id) slot, preventing cut-and-paste
  relocation of blobs. The v2 envelope magic is folded into the AAD (line 441),
  so the envelope version cannot be stripped or downgraded without failing the
  GCM auth tag. This defends both relocation and version-rollback attacks.
- **Versioned envelope** — v2 (`MAGIC||IV||ct`) vs legacy v1 (`IV||ct`) with a
  4-byte magic chosen so a random v1 IV misdetects as v2 with ~2^-32 probability
  (lines 372–401). Migration is idempotent.
- **Dual-vault separation is cryptographic, not cosmetic** — Vault B derives from
  an **independent passphrase** + distinct salt (lines 253–256); a holder of
  passphrase A alone cannot re-derive Vault B, so panic-close is meaningful.
- **HMAC-signed backups** with domain-separated keys; verification uses WebCrypto
  (constant-time tag comparison, line 178).

**Residual (both already tracked / documented):**
- **KDF is PBKDF2, not Argon2id.** 600k iterations is defensible today, but PBKDF2
  is GPU/ASIC-friendly. Argon2id is the memory-hard upgrade. *Deferred, in docs.*
- **Passphrase string lifetime** — the passphrase exists briefly as a JS string
  (`enc.encode(passphrase)`, line 221) until GC. WebCrypto-bounded and minor;
  worth `passphrase = null` after derivation to shorten its heap lifetime.

## 2. Tauri IPC surface — `src-tauri/src/lib.rs`

**Small and disciplined.** Exactly **8** `#[tauri::command]` functions:
`list_usb_devices`, `arm_deadmans_switch`, `disarm_deadmans_switch`,
`get_vault_salts`, `set_vault_salts`, `fetch_model_file`, `hosted_assistant_ask`,
`send_sms_reminder`.

- **No RCE-class sinks.** Zero `std::fs::write/read`, zero `std::process::Command`,
  zero SQL/`rusqlite` in the command surface (grep-verified). There is no
  arbitrary-file-path or arbitrary-SQL command to exploit.
- **Outbound is host-allowlisted** — `fetch_model_file` restricted to HuggingFace
  hosts (`is_allowed_model_host`, lines 162–172); `hosted_assistant_ask` hardcoded
  to `api.anthropic.com` (line 213). The webview cannot use either as an open
  outbound proxy (SSRF-resistant).
- **PHI excluded from the hosted path by construction** — `hosted_assistant_ask`
  accepts only `question` + `system_prompt` (lines 202–204). It has no access to
  the vault, client records, or resource list, so PHI cannot ride along even if a
  frontend bug tried. (Consistent with the routeEngine/guardrails default-closed
  gate.)
- **Key custody split** — salts live in the OS keychain; the derived AES keys
  never touch Rust (they stay non-extractable in the webview). Clean boundary.

**Residual:**
- `send_sms_reminder` and `hosted_assistant_ask` read API creds (Twilio,
  Anthropic) from process env. Correct pattern, but env-var creds are only as safe
  as the deploy — see §4.
- `fetch_model_file` returns `Vec<u8>` to the webview with no visible size cap;
  an allowlisted-but-large response is a minor DoS surface. Low priority.

## 3. Storage / PHI isolation — `src/utils/storageEngine.js`

- All records are encrypted **before** hitting IndexedDB; only ciphertext is
  stored. `saveSecureRecord`/`loadSecureRecord` build the AAD from
  `(vaultTag, recordId)` and route through the crypto engine — plaintext PHI does
  not persist. Every PHI-writing module verified this session routes through this
  path (no `localStorage`/`fetch` of PHI).
- The operational backend (`server/`, Express + Prisma/SQLite) holds **no PHI**;
  it is bound to `127.0.0.1`.

## 4. Supply chain — `npm audit`

**3 HIGH advisories, all one root cause, NOT reachable at runtime.**

- Root advisory: **`adm-zip <0.6.0`** — GHSA-xcpc-8h2w-3j85 (CVSS 7.5): a crafted
  ZIP triggers a ~4GB memory allocation (DoS).
- Dependency chain: `adm-zip` ← `onnxruntime-node` ← `@huggingface/transformers`.
  npm counts each hop, so "3 highs" = **one bug reported three times**.
- **Reachability: NOT reachable.** Sanctuary runs Whisper via **`onnxruntime-web`
  (WASM)** in a browser worker — `ort-wasm-simd-threaded…wasm` ships in `dist/`,
  and `onnxruntime-node` does **not** appear in the built bundle. `adm-zip` is
  pulled *only* by the unused Node binding. No app code imports `onnxruntime-node`
  or `adm-zip`. The vulnerable ZIP-parsing code path never executes.

**Recommendation:** low urgency (unreachable), but clean it up:
- `npm audit fix --force` downgrades `@huggingface/transformers` to `3.8.1`
  (a **semver-major** change) — test transcription still works before adopting.
- Or wait for a `transformers` 4.x release that bumps the `onnxruntime-node`
  optional dep; since it's unused here, deferring is acceptable.
- Separately, **Tauri is pinned at a release candidate** (`2.0.0-rc.17` /
  `tauri-build 2.0.0-rc.13`). Bump to stable Tauri 2.x before any real deployment.

## 5. Operational / secrets

- Backend command credentials (Twilio, Anthropic) live in process env, never in
  the frontend bundle or the vault. Correct — but this is exactly the class of
  secret that was **leaked to git** (`thezeeohh/server/.env`: Stripe test key,
  webhook secret, JWT secret) and remediated on 2026-07-19 (history rewritten +
  force-pushed; a pre-commit secret-scan gate now blocks recurrence). Rotation of
  those values remains an operator action. See
  [`github-support-cached-refs-request.md`](github-support-cached-refs-request.md).

---

## What this review is NOT

It did not run the app, fuzz any input, execute SAST/DAST, or verify the
cryptography by a certified professional. Those are Gate A of the pilot-readiness
checklist and remain required before real PHI. The finding here is narrow and
honest: **the cryptographic and IPC foundations are sound and worth the cost of a
formal audit; the only real supply-chain issue is present but unreachable; the
real-world weak point is operational secret hygiene, not the code.**

## Prioritized recommendations

1. **(Ops, do now)** Rotate the leaked Stripe/JWT/webhook secrets; confirm the
   secret-scan pre-commit hook is enabled (`git config core.hooksPath .githooks`).
2. **(Low)** Resolve the `adm-zip` chain — either `npm audit fix --force`
   (+retest Whisper) or track until `transformers` updates the optional dep.
3. **(Pre-deploy)** Move Tauri off the release candidate to stable 2.x.
4. **(Hardening, tracked)** Argon2id KDF; null the passphrase string post-derivation;
   add a size cap to `fetch_model_file`.
5. **(Required before real PHI)** Commission the formal Gate A audit — dynamic
   analysis + certified cryptographic verification.
