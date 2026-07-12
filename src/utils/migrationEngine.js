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
import { decryptRecord, isV2Payload } from './cryptoEngine';

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
