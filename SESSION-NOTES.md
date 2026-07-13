# Session Notes — 2026-07-12

Handoff notes so a future session can pick up without re-deriving context.
Branch: `sanctuary-app`. HEAD at time of writing: `abf2a9a` (all pushed).

---

## What this session did (high level)

1. **Full internal crypto security review** (`SECURITY-AUDIT.md`) with fixes:
   both CRITICALs (C1 real dual-vault separation, C2 record identity/AAD), M1,
   H1, H3, L1, L2, L3 — all fixed + tested. H2, M3, M4 deferred with written
   designs in `docs/`. M2 accepted-with-docs. Model 2 (hardware Vault B) designed
   only.
2. **Built out real features** (replacing mocks): Document Library, Resource
   Navigator (recovered from the original `/home/aziza/Desktop/Sanctuary/`
   HTML app — 17 real Baltimore orgs), Amina assistant (local Ollama LLM + guided
   fallback), Leaflet/OSM map, Medication Management (with MAT auto-routing to
   Vault B), Food/Recovery categories (unverified anchors), city filter.
3. **Swapped in the real Sanctuary logo/branding** across all icons + favicon.
4. **Grouped the sidebar** into 6 labelled sections.
5. **Live hardware verification** — see below; recorded in `VERIFICATION.md`.
6. Test suite: **104 tests, 18 files** (started at ZERO this session).

## Verified LIVE on real hardware (see VERIFICATION.md)
- Build/launch/render/navigable; Leaflet map renders in the webview.
- MAT medication → auto Vault B routing.
- **Persistence across a full cold restart** (keychain + IndexedDB + Vault B).
- **USB dead-man's switch**: arm → pull token → keys wiped → Vault B closed →
  recovery on re-auth (wipe-not-destroy). Bug found+fixed live (empty USB picker,
  `c6f7159`).

## Build/run notes (IMPORTANT for next session)
- `npm run tauri build` **always "fails" on the AppImage bundle step** on this
  hardened Linux box (linuxdeploy). This is IRRELEVANT — the binary, .deb, and
  .rpm build fine. The binary is at
  `src-tauri/target/release/app` — launch it directly.
- The desktop `.desktop` launchers were fixed to point at that binary with the
  new icon (`~/Desktop/Sanctuary.desktop` and
  `~/.local/share/applications/Sanctuary.desktop`).
- `csp: null` in `tauri.conf.json` (loose; not today's problem but worth noting).

---

## OPEN ISSUE — Audio Intake (task #30, NOT resolved)

On-device Whisper transcription. A chain of bugs was peeled LIVE; the first three
are fixed, the fourth is the current blocker:

1. ✅ Mic `getUserMedia` denied by WebKitGTK → fixed in `lib.rs` by granting only
   user-media permission (`c3da402`). VERIFIED LIVE.
2. ✅ Model load "Unrecognized token '<'" — `allowLocalModels=true` made
   transformers.js resolve a local path under `tauri://`, getting index.html →
   set `allowLocalModels=false` (`4a091e6`). VERIFIED LIVE (model downloaded).
3. ✅ Model init "Missing required scale … TransposeDQWeightsForMatMulNBits" —
   onnxruntime-web can't decode default q4/q8 quant → set `dtype:'fp32'`
   (`abf2a9a`). (fp32 loads, but see #4.)
4. ❌ **CURRENT BLOCKER — download freezes.** HuggingFace serves model files via a
   302 redirect to their **Xet CDN** (`us.aws.cdn.hf.co/xet-bridge-us/...`) whose
   `access-control-allow-origin` is `https://huggingface.co`. The app runs from
   `tauri://localhost`, so following the redirect stalls on CORS/origin. This is a
   HF-Xet-CDN vs `tauri://` incompatibility, not an app bug.

**Decision left to the user (not yet made):**
- (1) Route model downloads through the **Rust backend** (a Tauri command fetches
  the files server-side — no CORS — and feeds bytes to transformers.js via a
  custom `env` fetch handler). Robust but real work; may need iteration.
- (2) **Pre-download the model to a local path**, point transformers.js at it
  (`allowLocalModels` + `localModelPath`). Sidesteps the CDN at runtime.
- (3) Try an `env` flag to force HF's classic (non-Xet) resolve path — uncertain
  it exists in transformers.js 4.2.0.
- (4) **Mark Audio Intake a known limitation** and move on — it's blocked by an
  external CDN migration, a project unto itself.

Recommendation given: if must-have → option 1; if nice-to-have → option 4.
`dtype:'fp32'` is committed but the freeze happens before init, so fp32 vs
quantized is moot until the download path is fixed.

---

## Honest status / what's still NOT done (do not overstate)
- **Independent security audit** — the hard gate before real PHI. NOT done.
- **Cross-machine backup restore** — NOT tested (needs a 2nd machine).
- Audio Intake — blocked (above).
- Deferred hardening: H2 (Argon2id KDF), M3 (device-origin backup signing),
  M4/Model 2 (Rust key zeroize + hardware Vault B). Designs in `docs/`.
- Billing / insurance claims (837P) and e-prescribing were explicitly REFUSED as
  app features — they require licensed prescribers, DEA/Surescripts certification,
  and network PHI transmission that contradicts the local-first design. Any such
  work must be a separate, counsel-reviewed effort. MAT and meds are TRACKING
  records only, never prescribing.

## Key reference docs in repo
- `SECURITY-AUDIT.md` — findings + remediation status
- `VERIFICATION.md` — what was executed live on hardware (2026-07-12)
- `docs/remediation-C1-C2.md`, `docs/model2-hardware-vault-b.md`,
  `docs/backup-authenticity-M3.md` — deferred-work designs
- `docs/credibility-narrative.md` (technical) + `docs/credibility-narrative-grant.md`
  (funder-facing) — stakeholder summaries

## The "how much is it worth" thread
User asked repeatedly. Honest answer held all session: engineering effort to
rebuild ~$35–60k, but *verified* value was low ("2/10, 100% reported") until this
session's live hardware verification moved several core promises from reported to
executed. Real number still gated on the independent audit + cross-machine QA.
Do NOT put a dollar figure in artifacts — that needs real financial/market inputs
from the user, not the codebase.
