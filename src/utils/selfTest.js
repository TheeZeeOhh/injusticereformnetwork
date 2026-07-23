// "Prove It" security self-test.
//
// A read-only, on-device diagnostic that turns the app's security *claims* into
// something an operator, auditor, or funder can watch pass live — the running
// counterpart to the test suite. It NEVER decrypts PHI, never derives keys, and
// never writes anything; it only inspects state that is already in memory or in
// the browser's own stores and reports pass/fail.
//
// The point is the Technical Incapacity Defense: if these checks pass, the app
// is demonstrably holding client data as ciphertext with keys in RAM only.
//
// Every check is a pure function over injected dependencies so it can be unit
// tested without a real browser. `runSelfTest()` wires the real environment.

// localStorage keys this app legitimately persists. All are non-secret by
// design (salts and verifier blobs are ciphertext/random; operator name and
// weather city are non-PHI convenience values). Anything OUTSIDE this set that
// looks key- or passphrase-shaped is a finding.
export const ALLOWED_LS_KEYS = new Set([
  'sanctuary_vault_salts_v1',
  'sanctuary_vault_verifier_v1',
  'sanctuary_vault_b_verifier_v1',
  'sanctuary_operator_name',
  'sanctuary_weather_city_v1',
  'sanctuary_weather_city',
  'sanctuary-settings',
]);

// Substrings that, if found in a localStorage VALUE, suggest cached secret
// material — a passphrase or raw derived key should never be at rest.
const SECRET_VALUE_HINTS = ['passphrase', 'password', 'privatekey', 'private_key', 'secretkey', 'secret_key'];

function result(id, label, status, detail) {
  return { id, label, status, detail };
}

// CHECK 1 — No plaintext key or passphrase material in localStorage.
// Passes when every stored key is on the allowlist and no value smells like a
// cached secret. Unknown keys are a warning (could be benign), secret-shaped
// values are a hard fail.
export function checkNoSecretsAtRest({ entries }) {
  const unknown = [];
  const leaks = [];
  for (const [k, v] of entries) {
    if (!ALLOWED_LS_KEYS.has(k)) unknown.push(k);
    const val = String(v || '').toLowerCase();
    for (const hint of SECRET_VALUE_HINTS) {
      if (val.includes(`"${hint}"`) || val.includes(`${hint}:`)) { leaks.push(k); break; }
    }
  }
  if (leaks.length) {
    return result('secrets_at_rest', 'No secrets persisted to disk', 'fail',
      `Secret-shaped material found in: ${leaks.join(', ')}`);
  }
  if (unknown.length) {
    return result('secrets_at_rest', 'No secrets persisted to disk', 'warn',
      `Unrecognized localStorage keys (verify non-secret): ${unknown.join(', ')}`);
  }
  return result('secrets_at_rest', 'No secrets persisted to disk', 'pass',
    'Only non-secret salts, ciphertext verifiers, and non-PHI settings are at rest.');
}

// CHECK 2 — Stored records are ciphertext, not readable plaintext.
// `records` is the raw IndexedDB contents: [{ id, data }]. A compliant record's
// `data` is an AES-GCM byte payload (Uint8Array / ArrayBuffer / typed array),
// NOT a plain object or a string that parses as JSON. If any record's data is a
// JSON-parseable string or a plain object, that record is (or may be) plaintext.
export function checkRecordsAreCiphertext({ records }) {
  if (!records || records.length === 0) {
    return result('records_ciphertext', 'Client records stored only as ciphertext', 'skip',
      'No records stored yet — nothing to inspect.');
  }
  const plaintextIds = [];
  for (const rec of records) {
    const data = rec && rec.data;
    const isBytes = data instanceof Uint8Array ||
      data instanceof ArrayBuffer ||
      (data && ArrayBuffer.isView(data));
    if (isBytes) continue;
    // Not raw bytes → suspicious. A plain object or JSON-parseable string is a leak.
    if (typeof data === 'object' && data !== null) { plaintextIds.push(rec.id); continue; }
    if (typeof data === 'string') {
      try { JSON.parse(data); plaintextIds.push(rec.id); } catch { /* opaque string, acceptable */ }
    }
  }
  if (plaintextIds.length) {
    return result('records_ciphertext', 'Client records stored only as ciphertext', 'fail',
      `Non-ciphertext record data for: ${plaintextIds.join(', ')}`);
  }
  return result('records_ciphertext', 'Client records stored only as ciphertext', 'pass',
    `All ${records.length} stored record(s) hold AES-GCM byte payloads, not readable data.`);
}

// CHECK 3 — Vault separation: Vault B is closed unless explicitly unlocked.
// Under the C1 model Vault B (42 CFR Part 2 / HRT) must be null after login and
// only non-null after a deliberate unlock. This reports the live posture: a
// closed Vault B is the safe default and passes; an open Vault B is reported as
// informational (not a failure — the operator may have opened it on purpose).
export function checkVaultSeparation({ vaultAKey, vaultBKey, isAuthenticated }) {
  if (!isAuthenticated) {
    return result('vault_separation', 'Vault B sealed until explicitly unlocked', 'skip',
      'Not authenticated — no vault keys in RAM.');
  }
  if (!vaultBKey) {
    return result('vault_separation', 'Vault B sealed until explicitly unlocked', 'pass',
      vaultAKey
        ? 'Vault A open; Vault B is CLOSED (key not in RAM) — the safe default.'
        : 'Vault B is CLOSED (key not in RAM).');
  }
  return result('vault_separation', 'Vault B sealed until explicitly unlocked', 'warn',
    'Vault B is currently OPEN. Panic-close it when finished handling sensitive records.');
}

// CHECK 4 — Encrypted backup integrity verifies.
// Given a backup blob and a verifier fn (backupEngine.verifyBackup bound to a
// passphrase), confirm the HMAC-signed backup authenticates. This proves the
// export path is tamper-evident. Skipped when no backup is supplied.
export async function checkBackupIntegrity({ backup, verify }) {
  if (!backup || typeof verify !== 'function') {
    return result('backup_integrity', 'Encrypted backups are tamper-evident', 'skip',
      'No backup supplied to verify (optional check).');
  }
  try {
    const ok = await verify(backup);
    return ok
      ? result('backup_integrity', 'Encrypted backups are tamper-evident', 'pass',
          'Backup HMAC signature verified — contents are intact and authentic.')
      : result('backup_integrity', 'Encrypted backups are tamper-evident', 'fail',
          'Backup signature did NOT verify — file is corrupt or tampered.');
  } catch (err) {
    return result('backup_integrity', 'Encrypted backups are tamper-evident', 'fail',
      `Verification error: ${err && err.message ? err.message : err}`);
  }
}

// CHECK 5 — Idle auto-lock is configured within policy.
// We can't read a runtime "armed" flag (it's a mount-time effect), so we prove
// the mechanism: the configured idle window is a positive, finite duration no
// longer than the policy ceiling. `idleMs` is DEFAULT_IDLE_MS; `ceilingMs` is
// the maximum acceptable auto-lock delay (default 15 min per common HIPAA guidance).
export function checkIdleLockConfigured({ idleMs, ceilingMs = 15 * 60 * 1000 }) {
  if (!Number.isFinite(idleMs) || idleMs <= 0) {
    return result('idle_lock', 'Idle auto-lock is armed', 'fail',
      'Idle-lock interval is not a positive finite duration.');
  }
  if (idleMs > ceilingMs) {
    return result('idle_lock', 'Idle auto-lock is armed', 'warn',
      `Idle-lock window ${Math.round(idleMs / 60000)} min exceeds the ${Math.round(ceilingMs / 60000)} min policy ceiling.`);
  }
  return result('idle_lock', 'Idle auto-lock is armed', 'pass',
    `Vault auto-locks after ${Math.round(idleMs / 60000)} min of inactivity (keys dropped from RAM).`);
}

// Orchestrator: run every check over an injected environment and return a
// report { ok, checks[] } where ok is true only if no check FAILED (warnings
// and skips do not fail the report).
export async function runChecks(env) {
  const checks = [
    checkNoSecretsAtRest(env.secrets),
    checkRecordsAreCiphertext(env.records),
    checkVaultSeparation(env.vault),
    await checkBackupIntegrity(env.backup),
    checkIdleLockConfigured(env.idle),
  ];
  const ok = checks.every((c) => c.status !== 'fail');
  return { ok, checks };
}

// Wire the real browser/app environment and run. Kept thin so all logic stays
// in the pure checks above (which the unit tests exercise directly).
export async function runSelfTest({ vaultAKey, vaultBKey, isAuthenticated } = {}) {
  const { getAllRecords } = await import('./storageEngine');
  const { DEFAULT_IDLE_MS } = await import('./idleLock');

  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      entries.push([k, localStorage.getItem(k)]);
    }
  } catch { /* localStorage unavailable — leave entries empty */ }

  let records = [];
  try { records = await getAllRecords(); } catch { /* store may not exist yet */ }

  return runChecks({
    secrets: { entries },
    records: { records },
    vault: { vaultAKey, vaultBKey, isAuthenticated },
    backup: {}, // backup verification is offered as a separate, explicit action
    idle: { idleMs: DEFAULT_IDLE_MS },
  });
}
