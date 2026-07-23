import { describe, it, expect } from 'vitest';
import {
  checkNoSecretsAtRest,
  checkRecordsAreCiphertext,
  checkVaultSeparation,
  checkBackupIntegrity,
  checkIdleLockConfigured,
  runChecks,
  ALLOWED_LS_KEYS,
} from './selfTest';

describe('checkNoSecretsAtRest', () => {
  it('passes when only allowlisted keys are present', () => {
    const entries = [
      ['sanctuary_vault_salts_v1', '{"saltA":"..."}'],
      ['sanctuary_vault_verifier_v1', 'base64ciphertext'],
      ['sanctuary_operator_name', 'Jordan'],
    ];
    expect(checkNoSecretsAtRest({ entries }).status).toBe('pass');
  });

  it('warns on an unrecognized key (possibly benign)', () => {
    const entries = [['sanctuary_vault_salts_v1', 'x'], ['some_unknown_key', 'y']];
    const r = checkNoSecretsAtRest({ entries });
    expect(r.status).toBe('warn');
    expect(r.detail).toContain('some_unknown_key');
  });

  it('FAILS when a value looks like cached secret material', () => {
    const entries = [['sanctuary_vault_salts_v1', '{"passphrase":"hunter2"}']];
    const r = checkNoSecretsAtRest({ entries });
    expect(r.status).toBe('fail');
  });

  it('empty store passes (nothing at rest)', () => {
    expect(checkNoSecretsAtRest({ entries: [] }).status).toBe('pass');
  });
});

describe('checkRecordsAreCiphertext', () => {
  it('passes when every record data is a byte payload', () => {
    const records = [
      { id: 'client_1', data: new Uint8Array([1, 2, 3]) },
      { id: 'client_2', data: new Uint8Array([9, 9]).buffer },
    ];
    expect(checkRecordsAreCiphertext({ records }).status).toBe('pass');
  });

  it('skips when there are no records', () => {
    expect(checkRecordsAreCiphertext({ records: [] }).status).toBe('skip');
  });

  it('FAILS when a record holds a plain object (plaintext leak)', () => {
    const records = [
      { id: 'ok', data: new Uint8Array([1]) },
      { id: 'leak', data: { name: 'Jane Doe', dob: '1990-01-01' } },
    ];
    const r = checkRecordsAreCiphertext({ records });
    expect(r.status).toBe('fail');
    expect(r.detail).toContain('leak');
  });

  it('FAILS when a record data is a JSON-parseable string', () => {
    const records = [{ id: 'jsonleak', data: '{"phi":"exposed"}' }];
    expect(checkRecordsAreCiphertext({ records }).status).toBe('fail');
  });

  it('accepts an opaque (non-JSON) string as ciphertext-ish', () => {
    const records = [{ id: 'b64', data: 'q83vZ3n0tJsoN==' }];
    expect(checkRecordsAreCiphertext({ records }).status).toBe('pass');
  });
});

describe('checkVaultSeparation', () => {
  it('passes when Vault B is closed after login', () => {
    const r = checkVaultSeparation({ vaultAKey: {}, vaultBKey: null, isAuthenticated: true });
    expect(r.status).toBe('pass');
  });

  it('warns when Vault B is open', () => {
    const r = checkVaultSeparation({ vaultAKey: {}, vaultBKey: {}, isAuthenticated: true });
    expect(r.status).toBe('warn');
  });

  it('skips when not authenticated', () => {
    expect(checkVaultSeparation({ isAuthenticated: false }).status).toBe('skip');
  });
});

describe('checkBackupIntegrity', () => {
  it('passes when verify() returns true', async () => {
    const r = await checkBackupIntegrity({ backup: { x: 1 }, verify: async () => true });
    expect(r.status).toBe('pass');
  });

  it('FAILS when verify() returns false', async () => {
    const r = await checkBackupIntegrity({ backup: { x: 1 }, verify: async () => false });
    expect(r.status).toBe('fail');
  });

  it('FAILS when verify() throws', async () => {
    const r = await checkBackupIntegrity({ backup: { x: 1 }, verify: async () => { throw new Error('bad'); } });
    expect(r.status).toBe('fail');
    expect(r.detail).toContain('bad');
  });

  it('skips when no backup supplied', async () => {
    expect((await checkBackupIntegrity({})).status).toBe('skip');
  });
});

describe('checkIdleLockConfigured', () => {
  it('passes for a 5 minute window under the ceiling', () => {
    expect(checkIdleLockConfigured({ idleMs: 5 * 60 * 1000 }).status).toBe('pass');
  });

  it('warns when the window exceeds the policy ceiling', () => {
    const r = checkIdleLockConfigured({ idleMs: 30 * 60 * 1000, ceilingMs: 15 * 60 * 1000 });
    expect(r.status).toBe('warn');
  });

  it('FAILS on a non-positive interval', () => {
    expect(checkIdleLockConfigured({ idleMs: 0 }).status).toBe('fail');
    expect(checkIdleLockConfigured({ idleMs: NaN }).status).toBe('fail');
  });
});

describe('runChecks orchestration', () => {
  const cleanEnv = {
    secrets: { entries: [['sanctuary_vault_salts_v1', 'x']] },
    records: { records: [{ id: 'a', data: new Uint8Array([1]) }] },
    vault: { vaultAKey: {}, vaultBKey: null, isAuthenticated: true },
    backup: {},
    idle: { idleMs: 5 * 60 * 1000 },
  };

  it('reports ok=true when nothing fails', async () => {
    const rep = await runChecks(cleanEnv);
    expect(rep.ok).toBe(true);
    expect(rep.checks).toHaveLength(5);
  });

  it('reports ok=false when any check fails', async () => {
    const bad = { ...cleanEnv, records: { records: [{ id: 'leak', data: { phi: 1 } }] } };
    const rep = await runChecks(bad);
    expect(rep.ok).toBe(false);
  });

  it('warnings alone do not fail the report', async () => {
    const warnEnv = { ...cleanEnv, vault: { vaultAKey: {}, vaultBKey: {}, isAuthenticated: true } };
    const rep = await runChecks(warnEnv);
    expect(rep.ok).toBe(true);
  });
});

describe('allowlist sanity', () => {
  it('includes the core non-secret persisted keys', () => {
    expect(ALLOWED_LS_KEYS.has('sanctuary_vault_salts_v1')).toBe(true);
    expect(ALLOWED_LS_KEYS.has('sanctuary_vault_verifier_v1')).toBe(true);
    expect(ALLOWED_LS_KEYS.has('sanctuary_vault_b_verifier_v1')).toBe(true);
  });
});
