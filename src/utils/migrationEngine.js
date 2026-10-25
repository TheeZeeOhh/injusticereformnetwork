// migrationEngine.js
//
// One-time, idempotent v1 -> v2 record migration (finding C2).
//
// Records written before the AAD change are v1 (IV || ciphertext, no identity
// binding). This pass rewrites them into the v2 envelope with per-record AAD
// bound to (vaultTag, recordId), so a record can no longer be relocated to a
// different id or replayed across vaults. It is safe to run on every login:
// already-v2 records are detected by their magic prefix and skipped.
import { getAllRecords, saveSecureRecord, loadSecureRecord, deleteRawRecord, compactRecordStore } from './storageEngine';
import { appendEntry, rewriteVaultBEntryIds } from './auditLog';
import {
  decryptRecord,
  buildRecordAad,
  isVaultBStorageId,
  vaultBStorageId,
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
//   Vault B ids: 'vb_*' (opaque, current), and the LEGACY readable ids that
//   predate opaque storage: 'consent_*' (incl. 'consent_index'), 'hrt_*',
//   'bam_history_*', 'med_index_b', 'saved_resources'.
// The last three were written with tag 'B' but used to classify as A, so the
// orphaned-records guard (H1) and the re-key upgrade could not see them.
const LEGACY_B_PREFIXES = ['consent_', 'hrt_', 'bam_history_'];
const LEGACY_B_IDS = new Set(['med_index_b', 'saved_resources']);

export function vaultTagForId(recordId) {
  if (
    isVaultBStorageId(recordId) ||
    LEGACY_B_IDS.has(recordId) ||
    LEGACY_B_PREFIXES.some((p) => recordId.startsWith(p))
  ) {
    return 'B';
  }
  return 'A';
}

// A Vault B record still stored under its readable (logical) id.
function isReadableVaultBId(recordId) {
  return vaultTagForId(recordId) === 'B' && !isVaultBStorageId(recordId);
}

// Moves one legacy Vault B record from its readable id to its opaque id, the
// crash-safe way: write the new copy, read it back, and only then delete the
// old one. A crash at any point leaves the data old or duplicated, never lost;
// the next unlock finishes the job. If the opaque id already holds a record
// (a re-run after a crash, or an old backup restored over newer data), the
// current record wins and only the readable copy is removed.
async function moveToOpaqueId(vaultBKey, rec) {
  // v2 records were sealed with AAD over the logical id, which is still what
  // the AAD binds. v1 records carry no AAD: read them unbound on purpose (this
  // is the migration path) and the re-save upgrades them to v2.
  const aad = isV2Payload(rec.data) ? buildRecordAad('B', rec.id) : undefined;
  const plaintext = await decryptRecord(vaultBKey, rec.data, aad);
  let conflict = false;
  try {
    conflict = (await loadSecureRecord(vaultBKey, rec.id, 'B')) !== null;
  } catch {
    conflict = false; // unreadable target: overwrite it with the legacy copy
  }
  if (!conflict) {
    await saveSecureRecord(vaultBKey, rec.id, plaintext, 'B');
    const back = await loadSecureRecord(vaultBKey, rec.id, 'B');
    if (JSON.stringify(back) !== JSON.stringify(plaintext)) {
      throw new Error('read-back mismatch after moving to opaque id');
    }
  }
  await deleteRawRecord(rec.id);
  return { conflict };
}

// Moves every Vault B record still under a readable id to its opaque id, then
// rewrites the audit log so its past Vault B entries name opaque ids too.
// Runs on every Vault B unlock (it is a no-op once nothing readable is left),
// which also covers records reinstated by restoring an older backup.
//
// Per-record, never throws for one bad record: a record that does not decrypt
// under this Vault B key is left in place and reported, not destroyed.
// Returns { moved, conflicts, failed, failures, audit }.
export async function migrateVaultBRecords(vaultBKey) {
  const all = await getAllRecords();
  let moved = 0;
  let conflicts = 0;
  let failed = 0;
  const failures = [];
  for (const rec of all) {
    if (!isReadableVaultBId(rec.id)) continue;
    try {
      const { conflict } = await moveToOpaqueId(vaultBKey, rec);
      if (conflict) conflicts += 1; else moved += 1;
    } catch (err) {
      failed += 1;
      // Count only: the id itself is the client ref this migration hides.
      failures.push({ error: String(err) });
    }
  }

  // Deleted rows survive in the SQLite files; rebuild so the readable ids
  // are gone from disk, not just from the live table.
  let compacted = false;
  if (moved || conflicts) {
    try {
      await compactRecordStore();
      compacted = true;
    } catch (err) {
      console.warn('Vault rebuild after Vault B id migration failed:', err);
    }
  }

  let audit = { rewritten: 0 };
  try {
    audit = await rewriteVaultBEntryIds((logicalId) => vaultBStorageId(vaultBKey, logicalId));
  } catch (err) {
    audit = { rewritten: 0, error: String(err) };
  }
  if (moved || conflicts) {
    appendEntry({ action: 'admin', recordId: `vaultB_ids_opaque:${moved + conflicts}`, vaultTag: 'B' });
  }
  return { moved, conflicts, failed, failures, compacted, audit };
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
      if (vaultTag === 'B') {
        // A Vault B record also leaves its readable id for its opaque one.
        await moveToOpaqueId(key, rec);
        migrated += 1;
        continue;
      }
      // v1 decrypt: no AAD (decryptRecord auto-detects the legacy layout).
      const plaintext = await decryptRecord(key, rec.data);
      // v2 write: saveSecureRecord rebuilds the (vaultTag, id) AAD and seals it.
      await saveSecureRecord(key, rec.id, plaintext, vaultTag);
      migrated += 1;
    } catch (err) {
      failed += 1;
      // A Vault B id is itself the client ref being hidden: never echo it.
      const shownId = vaultTag === 'B' ? '(vault B record)' : rec.id;
      failures.push({ id: shownId, error: String(err) });
      console.warn(`v1->v2 migration skipped record '${shownId}':`, err);
    }
  }

  return { migrated, skipped, failed, failures };
}

// --- C1 Vault B re-key upgrade (legacy install -> independent Vault B pass) ---

// A record belongs to the LEGACY Vault B set if it has a Vault B id and is still
// v1 (a v2 Vault B record was already written under the new key). Post-C1 fresh
// records are v2, so this only ever matches pre-C1 data.
function isLegacyVaultBRecord(rec) {
  return isReadableVaultBId(rec.id) && !isV2Payload(rec.data);
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
  // saveSecureRecord stores it under its opaque id.
  let rekeyed = 0;
  for (const { id, plaintext } of decrypted) {
    await saveSecureRecord(newBKey, id, plaintext, 'B');
    rekeyed += 1;
  }

  // Phase 4 — only after every record is safely re-encrypted, remove the
  // legacy copies, whose readable ids name the clients.
  for (const { id } of decrypted) {
    await deleteRawRecord(id);
  }
  if (decrypted.length) {
    try {
      await compactRecordStore();
    } catch (err) {
      console.warn('Vault rebuild after re-key failed:', err);
    }
  }
  try {
    await rewriteVaultBEntryIds((logicalId) => vaultBStorageId(newBKey, logicalId));
  } catch (err) {
    console.warn('audit log Vault B id rewrite did not complete:', err);
  }

  return { rekeyed };
}
