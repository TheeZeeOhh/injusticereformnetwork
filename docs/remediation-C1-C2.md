# Remediation Design — C1 (Dual-Vault Separation) & C2 (Record AAD)

**Status:** Design proposal. No crypto code has been changed. This document
specifies *what* to change and *why*, with enough precision that an implementer
(or a security reviewer) can evaluate the approach before any code is written.

**Companion to:** `SECURITY-AUDIT.md` (findings C1, C2).

**Design goals, in priority order:**
1. Actually meet the stated threat model (Vault B protected independently of
   Vault A; records bound to their identity).
2. Do not silently destroy existing encrypted records — provide a defined
   migration path.
3. Keep raw key material out of the JS heap and off disk, as today.
4. Keep the change surface small and reviewable.

---

## Shared prerequisite: a versioned record envelope

Both fixes need to distinguish old ciphertext from new. Today a stored record is:

```
{ id, data: <Uint8Array = IV(12) || ciphertext> }
```

There is no version marker, so a migration cannot tell v1 blobs from v2 blobs.
Introduce a one-byte version prefix on the payload produced by `encryptRecord`:

```
v1 (existing, implicit):  IV(12) || ciphertext
v2 (new):                 0x02 || IV(12) || ciphertext        (AAD applied)
```

`decryptRecord` inspects the first byte:
- leading byte `0x02` → v2 path (AAD required, see C2).
- anything else → treat as legacy v1 (no version byte, no AAD).

This lets a single reader handle both formats during migration, and lets C2 ship
without a flag-day rewrite of every record. The version byte is outside the
GCM ciphertext but *is* fed into the AAD (below), so it cannot be downgraded
without detection on v2 records.

> Rationale for a byte prefix over a JSON wrapper: the stored value is a raw
> `Uint8Array` and the backup format base64s it directly; a structural change to
> an object wrapper would ripple through `storageEngine`, `backupEngine`, and
> every base64 helper. A leading byte is the minimal disambiguator.

---

## C2 — Bind record identity into AES-GCM as AAD

### Problem recap
`encryptRecord`/`decryptRecord` use AES-GCM with no Additional Authenticated
Data, so a ciphertext authenticates under *any* id. Blobs are swappable between
record slots (e.g. `client_A` ↔ `client_B`, or an old `evidence_blob` rolled
back over a new one) without detection.

### Design

**1. Thread the record id through the crypto boundary.**

Change the internal signatures (design intent, not final code):

```
encryptRecord(cryptoKey, data, aadContext)
decryptRecord(cryptoKey, payload, aadContext)
```

where `aadContext` is a canonical byte string uniquely identifying the slot the
ciphertext is allowed to occupy. Proposed canonical form:

```
AAD = utf8( "sanctuaryv2|" + vaultTag + "|" + recordId )
```

- `vaultTag` ∈ { `"A"`, `"B"` } — also defends the C1 boundary (a Vault B blob
  cannot be replayed into a Vault A slot even if keys were ever confused).
- `recordId` — the IndexedDB keyPath already passed to `saveSecureRecord`.
- The literal `"sanctuaryv2|"` domain-separates from any future AAD scheme.

The version byte `0x02` is prepended to this AAD as well (or included as an
explicit field), so a v2 ciphertext cannot be reinterpreted as v1.

**2. `storageEngine` supplies the AAD; callers are unchanged.**

`saveSecureRecord(key, recordId, payload)` and `loadSecureRecord(key, recordId)`
*already* receive `recordId`. They construct the AAD internally and pass it down.
**No page component changes** — this is the key ergonomic win. `putRawRecord`
(restore) and `getAllRecords` (backup) still move opaque bytes and need no AAD,
because backup integrity is handled separately by the HMAC.

`storageEngine` must, however, know the `vaultTag`. Two options:

- **(preferred)** derive it from which key is passed. The store can't see that,
  so add an explicit param: `saveSecureRecord(key, recordId, payload, vaultTag)`
  with the four Vault-B call sites (`ConsentManager`, `HrtTracking`, and any
  future Vault B module) passing `"B"`, all others `"A"`. This is a small,
  greppable change and makes the vault boundary explicit at every call site —
  arguably a feature.
- **(alternative)** tag the key object at derivation time and carry the tag in
  the auth store alongside the key. Avoids touching call sites but stores a
  hint next to the key; acceptable since the tag is not secret.

Recommend the explicit param: it is auditable and self-documenting.

**3. Migration (v1 → v2).**

- On successful login, run a one-time `migrateRecordsToV2(key, vaultTag)` pass:
  for each record whose payload lacks the `0x02` prefix, decrypt with the v1
  path, re-encrypt with AAD, `putRawRecord`. Idempotent; safe to re-run.
- Migration must be per-vault (A records under the A key, B records under the B
  key). Records are already namespaced by id prefix, so the pass can select the
  right set. Anything ambiguous is left as v1 and logged.
- Until migration completes, `decryptRecord` still accepts v1, so nothing breaks
  mid-migration.

### Failure semantics
- A v2 record loaded under the wrong id (or wrong vaultTag) fails the GCM auth
  tag and throws exactly as a wrong key does today — the existing
  "Cryptographic Read Failure" path already surfaces this. **This is the desired
  behavior**: substitution now = decryption failure.

### Tests this unlocks (see suite plan)
- Encrypt under id X, attempt decrypt under id Y → must throw.
- Encrypt under vaultTag A, attempt decrypt as vaultTag B → must throw.
- v1 blob still decrypts pre-migration; same blob decrypts post-migration.
- Tampered version byte → throw.

---

## C1 — Real cryptographic separation of Vault B

### Problem recap
Both vault keys derive from the **same** passphrase (differing only by
non-secret salt). "Close Vault B" only drops a RAM reference; the key is
instantly re-derivable from the same passphrase. There is no state in which
Vault A is open but Vault B is cryptographically inaccessible.

### Design principle
Vault B must require a **secret that Vault A does not**. Closing Vault B must
remove that secret from reach, so that a passphrase-A holder alone cannot
re-derive the Vault B key. Two viable models:

---

#### Model 1 — Independent Vault B passphrase (recommended baseline)

- Onboarding gains a step: set a **separate** Vault B passphrase (distinct from
  the Vault A passphrase; enforce non-equality and the same strength policy).
- `deriveVaultKeys` splits:
  - `vaultAKey = KDF(passphraseA, saltA)`
  - `vaultBKey = KDF(passphraseB, saltB)`  ← different *secret*, not just salt.
- Login prompts for passphrase A (opens Vault A). Opening Vault B is a separate,
  explicit action ("Unlock Vault B") prompting for passphrase B on demand.
- **Panic close** (`panicWipeVaultB`) drops `vaultBKey` *and* ensures passphrase
  B is not cached anywhere; re-opening requires re-entering passphrase B. This
  makes the panic button meaningful: without passphrase B in hand, Vault B
  ciphertext is inert even to the logged-in operator.
- Add a **Vault B verifier** blob (mirror of the Vault A verifier) so a wrong
  Vault B passphrase is rejected before any Vault B record is touched (also
  closes finding M1).

**Threat-model result:** an adversary who compromises passphrase A (coercion,
shoulder-surf, keylogger during a Vault A session) still cannot read Vault B
without separately obtaining passphrase B. This is the separation the README
claims.

**Cost:** one onboarding step, an unlock flow, a second verifier. No new
dependencies.

---

#### Model 2 — Hardware-bound Vault B key (stronger; optional upgrade)

Bind Vault B to the USB token that already exists in the design
(`src-tauri/src/lib.rs`), so Vault B additionally requires *hardware presence*:

- Vault B key = KDF(passphraseB, saltB) **XOR/HKDF-combined** with a secret
  derived from the hardware token (e.g. a challenge-response or a key blob
  released only while the token is present).
- The existing dead-man's switch already emits `usb-disconnect-kill-signal`;
  wire it so token removal wipes `vaultBKey` (it already triggers `logout`,
  which wipes it — extend to wipe the hardware-derived component too).
- Best held in the **Rust layer** with `zeroize` (also addresses M4), exposing
  only scoped encrypt/decrypt to the webview rather than the raw key.

**Threat-model result:** Vault B is inaccessible without both passphrase B *and*
physical possession of the token. Strongest posture; matches the "violent
removal annihilates keys" narrative already in onboarding.

**Cost:** meaningfully more Rust work, token provisioning/recovery UX, and a
recovery story for a lost token (otherwise lost token = lost Vault B forever —
must be an explicit, accepted tradeoff with a backup escrow decision).

---

### Recommended path for C1
Ship **Model 1** first — it fully closes the finding with low risk and no new
dependencies — and treat **Model 2** as a subsequent hardening milestone once
the token flow is runtime-QA'd (which the README lists as still unverified).

### Migration for C1
- Existing Vault B records were encrypted under `KDF(passphraseA, saltB)`.
  Introducing a distinct passphrase B changes the key, so a **one-time re-key**
  is required: on first upgrade, prompt the operator to (a) authenticate with
  the current passphrase to decrypt existing Vault B records, (b) set the new
  Vault B passphrase, (c) re-encrypt those records under the new Vault B key
  (and, since we're rewriting them anyway, straight into v2/AAD format).
- This re-key pass must be transactional in spirit: decrypt-all → set-new →
  re-encrypt-all → only then discard the old derivation. If interrupted, the old
  records remain readable under the legacy path until the pass completes.
- Fresh installs skip migration entirely (they set both passphrases at
  onboarding).

---

## Sequencing & blast radius

| Step | Change | Files touched | Risk |
|------|--------|---------------|------|
| 1 | Version byte + dual-format `decryptRecord` | `cryptoEngine.js` | Low |
| 2 | C2 AAD in encrypt/decrypt + `storageEngine` threading | `cryptoEngine.js`, `storageEngine.js`, ~12 page call sites (add `vaultTag`) | Low–Med |
| 3 | C2 migration pass on login | `authStore.js` (+ helper) | Med (touches all records) |
| 4 | C1 Model 1: split derivation, Vault B passphrase + verifier, unlock/panic flow | `cryptoEngine.js`, `authStore.js`, `Onboarding.jsx`, `Login.jsx`, new "Unlock Vault B" UI | Med–High |
| 5 | C1 migration: Vault B re-key | migration helper | High (re-encrypts sensitive data) |
| 6 | (later) C1 Model 2: hardware binding + Rust zeroize | `src-tauri/src/lib.rs`, `authStore.js` | High |

**Ordering rationale:** land C2 first (steps 1–3) because it is lower risk,
independent of passphrase changes, and its version-envelope + AAD-by-vaultTag
work *also* lays the groundwork for C1's re-key pass (which writes v2 records
anyway). C1 (steps 4–5) builds on top.

---

## Non-goals / explicitly out of scope here
- KDF upgrade (Argon2id) — finding H2, separate design.
- Passphrase strength policy — finding H3, separate design.
- Automated crypto test suite — required before shipping any of this to real
  PHI, tracked separately. Each step above lists the tests it should ship with.

---

## Maintainer decisions (RESOLVED 2026-07-12)
1. **C1 model:** **Model 1 first** (independent Vault B passphrase), Model 2
   (hardware binding) as a later hardening milestone. — CONFIRMED.
2. **Vault B recovery:** **Unrecoverable by design.** No escrow / recovery blob.
   A forgotten Vault B passphrase means Vault B data is permanently lost. This
   preserves full C1 separation (a recovery blob would partially reintroduce the
   original weakness). Onboarding and the upgrade screen MUST warn the operator
   of this explicitly and require acknowledgement. — CONFIRMED.
3. **vaultTag plumbing:** **Explicit call-site param.** — CONFIRMED (already
   implemented in C2 work).
4. **Migration UX:** **Explicit "upgrade your vault" screen** for the C1 Vault B
   re-key (not silent), because it touches Vault B secrets and must be a
   deliberate, acknowledged action. (C2's v1→v2 pass stays silent-on-login.)
   — CONFIRMED.
