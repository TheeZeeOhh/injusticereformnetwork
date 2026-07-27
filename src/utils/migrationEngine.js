// migrationEngine.js
//
// One-time, idempotent v1 -> v2 record migration (finding C2).
//
// Records written before the AAD change are v1 (IV || ciphertext, no identity
// binding). This pass rewrites them into the v2 envelope with per-record AAD
// bound to (vaultTag, recordId), so a record can no longer be relocated to a
// different id or replayed across vaults. It is safe to run on every login:
// already-v2 records are detected by their magic prefix and skipped.
import { getAllRecords, saveSecureRecord } from './storageEngine';
import {
  decryptRecord,
  isV2Payload,
  deriveLegacyVaultBKey,
  deriveVaultBKey,
  createOrVerifyPassphrase,
  vaultBEnrolled
} from './cryptoEngine';
import { passphraseRejectionReason } from './passphrasePolicy';

// Classifies a record id to the vault it belongs to. Vault B holds the sensitive
// (42 CFR Part 2 / HRT) classes; everything else is Vault A. This MUST match the
// vaultTag the page components pass at their call sites, or re-encryption would
// bind the wrong tag.
//   Vault B ids: 'consent_index', 'consent_*', 'hrt_*'
export function vaultTagForId(recordId) {
  if (
    recordId === 'consent_index' ||
    recordId.startsWith('consent_') ||
    recordId.startsWith('hrt_')
  ) {
    return 'B';
  }
  return 'A';
}

// True if any encrypted record belonging to `vaultTag` ('A' | 'B') exists in the
// store. Used to guard enrollment against silent re-enrollment over orphaned
// data (finding H1): "no verifier but records exist" is a lost-verifier state,
// not a first run.
export async function vaultHasRecords(vaultTag) {
  const all = await getAllRecords();
  return all.some((rec) => vaultTagForId(rec.id) === vaultTag);
}

// Migrates every legacy v1 record to v2, decrypting with the vault key that owns
// it and re-encrypting with the matching AAD. Requires BOTH vault keys because a
// single IndexedDB store interleaves Vault A and Vault B records.
//
// Returns { migrated, skipped, failed, failures } — never throws for a single
// bad record; it logs and continues so one corrupt blob can't block the rest.
export async function migrateRecordsToV2(vaultAKey, vaultBKey) {
  const all = await getAllRecords();
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  for (const rec of all) {
    // Already upgraded — idempotent skip.
    if (isV2Payload(rec.data)) {
      skipped += 1;
      continue;
    }

    const vaultTag = vaultTagForId(rec.id);
    const key = vaultTag === 'B' ? vaultBKey : vaultAKey;

    // Vault B records can't be migrated while Vault B is closed (no key). Leave
    // them as v1 for a later pass rather than corrupting them.
    if (!key) {
      skipped += 1;
      continue;
    }

    try {
      // v1 decrypt: no AAD (decryptRecord auto-detects the legacy layout).
      const plaintext = await decryptRecord(key, rec.data);
      // v2 write: saveSecureRecord rebuilds the (vaultTag, id) AAD and seals it.
      await saveSecureRecord(key, rec.id, plaintext, vaultTag);
      migrated += 1;
    } catch (err) {
      failed += 1;
      failures.push({ id: rec.id, error: String(err) });
      console.warn(`v1->v2 migration skipped record '${rec.id}':`, err);
    }
  }

  return { migrated, skipped, failed, failures };
}

// --- C1 Vault B re-key upgrade (legacy install -> independent Vault B pass) ---

// A record belongs to the LEGACY Vault B set if it has a Vault B id and is still
// v1 (a v2 Vault B record was already written under the new key). Post-C1 fresh
// records are v2, so this only ever matches pre-C1 data.
function isLegacyVaultBRecord(rec) {
  return vaultTagForId(rec.id) === 'B' && !isV2Payload(rec.data);
}

// True if this install has pre-C1 Vault B records that still need re-keying AND
// no independent Vault B passphrase has been enrolled yet. This is the signal the
// UI uses to show the explicit "upgrade your vault" screen.
export async function needsVaultBRekey() {
  if (vaultBEnrolled()) return false; // already on an independent B passphrase
  const all = await getAllRecords();
  return all.some(isLegacyVaultBRecord);
}

// One-time Vault B re-key. On legacy installs, Vault B records were encrypted
// under the LOGIN passphrase + saltB. This decrypts them with that legacy key,
// enrolls the NEW independent Vault B passphrase, and re-encrypts each record
// under the new Vault B key in v2/AAD form.
//
// Transactional in spirit: every legacy record is decrypted FIRST (all-or-
// nothing). If any decryption fails, nothing is enrolled or written, so the
// legacy records stay readable under the old path and the operator can retry.
//
// Returns { rekeyed } on success. Throws on a bad login passphrase (nothing
// decrypts) or if the new Vault B passphrase is invalid — leaving state untouched.
export async function rekeyVaultB(loginPassphrase, newPassphraseB) {
  if (vaultBEnrolled()) {
    // Already migrated — nothing to do. Idempotent no-op.
    return { rekeyed: 0 };
  }
  // The new Vault B passphrase is always a fresh enrollment — enforce the full
  // strength policy (finding H3), plus the distinct-from-login rule.
  const reason = passphraseRejectionReason(newPassphraseB);
  if (reason) throw new Error(reason);
  if (newPassphraseB === loginPassphrase) {
    throw new Error('Vault B passphrase must differ from the login passphrase.');
  }

  const legacyBKey = await deriveLegacyVaultBKey(loginPassphrase);
  const all = await getAllRecords();
  const legacy = all.filter(isLegacyVaultBRecord);

  // Phase 1 — decrypt EVERYTHING up front. Any failure aborts before we mutate
  // anything (wrong login passphrase, or a corrupt record).
  const decrypted = [];
  for (const rec of legacy) {
    let plaintext;
    try {
      plaintext = await decryptRecord(legacyBKey, rec.data);
    } catch {
      throw new Error(
        'Could not decrypt existing Vault B records with the login passphrase. ' +
        'Re-key aborted; nothing was changed.'
      );
    }
    decrypted.push({ id: rec.id, plaintext });
  }

  // Phase 2 — enroll the new Vault B passphrase (creates the B verifier).
  const newBKey = await deriveVaultBKey(newPassphraseB);
  // Deliberate enrollment over existing records: vaultBEnrolled() was checked
  // above (no B verifier yet), and the records being re-keyed were already
  // decrypted successfully in Phase 1, so nothing is orphaned. Intent is stated
  // explicitly rather than relying on an omitted flag (finding F2).
  await createOrVerifyPassphrase(newBKey, 'B', { allowEnrollOverRecords: true });

  // Phase 3 — re-encrypt each record under the new Vault B key (v2 + AAD).
  let rekeyed = 0;
  for (const { id, plaintext } of decrypted) {
    await saveSecureRecord(newBKey, id, plaintext, 'B');
    rekeyed += 1;
  }

  return { rekeyed };
}
