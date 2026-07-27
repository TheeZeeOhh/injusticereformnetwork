import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { putRawRecord, loadSecureRecord } from './storageEngine';
import { needsVaultBRekey, rekeyVaultB } from './migrationEngine';
import {
  deriveLegacyVaultBKey,
  deriveVaultBKey,
  vaultBEnrolled,
  createOrVerifyPassphrase
} from './cryptoEngine';

// Task #8 — C1 Vault B re-key upgrade for legacy installs.
//
// Legacy Vault B records were encrypted under (login passphrase + saltB). The
// upgrade re-encrypts them under a NEW independent Vault B passphrase.

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

// Seed a LEGACY v1 Vault B record: encrypted under the legacy B key (login pass +
// saltB), no magic, no AAD — exactly what a pre-C1 install holds.
async function seedLegacyVaultBRecord(loginPass, id, data) {
  const legacyKey = await deriveLegacyVaultBKey(loginPass);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    legacyKey,
    new TextEncoder().encode(JSON.stringify(data))
  );
  const payload = new Uint8Array(iv.length + ct.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(ct), iv.length);
  await putRawRecord({ id, data: payload });
}

const LOGIN = 'login-passphrase';
const NEW_B = 'separate-vault-b-pass';

describe('Vault B re-key upgrade (C1)', () => {
  beforeEach(() => {
    installLocalStorage();
    globalThis.indexedDB = new IDBFactory();
  });

  it('needsVaultBRekey is true when legacy Vault B records exist and B is not enrolled', async () => {
    await seedLegacyVaultBRecord(LOGIN, 'hrt_client7', { regimen: 'x' });
    expect(await needsVaultBRekey()).toBe(true);
  });

  it('needsVaultBRekey is false on a fresh install (no legacy B records)', async () => {
    expect(await needsVaultBRekey()).toBe(false);
  });

  it('re-keys legacy records so they read under the NEW Vault B passphrase', async () => {
    await seedLegacyVaultBRecord(LOGIN, 'consent_index', [{ id: 'c1' }]);
    await seedLegacyVaultBRecord(LOGIN, 'hrt_client7', { regimen: 'x' });

    const res = await rekeyVaultB(LOGIN, NEW_B);
    expect(res.rekeyed).toBe(2);
    expect(vaultBEnrolled()).toBe(true);

    // Readable under the new Vault B key.
    const newBKey = await deriveVaultBKey(NEW_B);
    expect(await loadSecureRecord(newBKey, 'hrt_client7', 'B')).toEqual({ regimen: 'x' });
    expect(await loadSecureRecord(newBKey, 'consent_index', 'B')).toEqual([{ id: 'c1' }]);

    // No longer needs re-key.
    expect(await needsVaultBRekey()).toBe(false);
  });

  it('after re-key, the LOGIN passphrase can no longer open Vault B', async () => {
    await seedLegacyVaultBRecord(LOGIN, 'hrt_client7', { regimen: 'x' });
    await rekeyVaultB(LOGIN, NEW_B);

    // The legacy B key (login pass) must fail the new Vault B verifier.
    const legacyKey = await deriveLegacyVaultBKey(LOGIN);
    expect(await createOrVerifyPassphrase(legacyKey, 'B', { recordsExist: false })).toBe(false);
  });

  it('aborts without changes if the login passphrase is wrong', async () => {
    await seedLegacyVaultBRecord(LOGIN, 'hrt_client7', { regimen: 'x' });

    await expect(rekeyVaultB('WRONG-login', NEW_B)).rejects.toThrow(/could not decrypt/i);
    // Nothing enrolled, still flagged for re-key.
    expect(vaultBEnrolled()).toBe(false);
    expect(await needsVaultBRekey()).toBe(true);
  });

  it('rejects a new Vault B passphrase equal to the login passphrase', async () => {
    await seedLegacyVaultBRecord(LOGIN, 'hrt_client7', { regimen: 'x' });
    await expect(rekeyVaultB(LOGIN, LOGIN)).rejects.toThrow(/must differ/i);
    expect(vaultBEnrolled()).toBe(false);
  });

  it('is a no-op once Vault B is already enrolled', async () => {
    // Enroll B directly, then a re-key attempt should do nothing.
    const bKey = await deriveVaultBKey(NEW_B);
    await createOrVerifyPassphrase(bKey, 'B', { recordsExist: false });
    const res = await rekeyVaultB(LOGIN, NEW_B);
    expect(res.rekeyed).toBe(0);
  });
});
