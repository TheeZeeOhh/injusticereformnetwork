import { ClientSchema } from './client';
import { saveSecureRecord, loadSecureRecord } from '../utils/storageEngine';

// Validating wrappers around the encrypted vault store. Validation runs on the
// plaintext object; the crypto/AAD/vault path in storageEngine is untouched.
//
// WRITE is fail-CLOSED: a malformed client object must never be encrypted into
// the vault. READ is fail-OPEN: a schema mismatch must never lose a client's
// data — we warn and return the raw decrypted object instead of throwing.

// Save a validated client record. Throws if the payload doesn't match the
// schema (so bad data can't reach the vault). Returns saveSecureRecord's result.
export async function saveClientRecord(key, recordId, payload, vaultTag) {
  const parsed = ClientSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Client record failed schema validation: ${parsed.error.message}`);
  }
  return saveSecureRecord(key, recordId, parsed.data, vaultTag);
}

// Load and validate a client record. Returns null if absent. On a schema
// mismatch, warns and returns the raw decrypted object (fail-open) so a schema
// change can never orphan existing client data.
export async function loadClientRecord(key, recordId, vaultTag) {
  const raw = await loadSecureRecord(key, recordId, vaultTag);
  if (raw == null) return null;
  const parsed = ClientSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn('Loaded client record did not match schema; returning raw.', parsed.error);
    return raw;
  }
  return parsed.data;
}
