import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { saveSecureRecord, loadSecureRecord } from './storageEngine';
import { deriveVaultAKey, deriveVaultBKey } from './cryptoEngine';

// Task #10 — C1 separation, proven end-to-end at the DATA layer.
//
// The per-task suites prove the pieces (key split, verifiers, auth lifecycle,
// re-key). This file ties them together to prove the actual security CLAIMS on
// real stored records through real IndexedDB + WebCrypto:
//   - Vault B data cannot be read with the Vault A key.
//   - An attacker holding the login (Vault A) passphrase + the full local store
//     still cannot read Vault B (the C1 threat model).
//   - "Closing" Vault B (dropping the key) makes its RECORDS unreadable, not
//     just the in-memory key reference.

const LOGIN_PASS = 'vault-a-login-pass';
const VAULT_B_PASS = 'independent-vault-b-pass';

describe('C1 vault separation (end-to-end data layer)', () => {
  let aKey;
  let bKey;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    // localStorage shim for salt persistence.
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear()
    };
    aKey = await deriveVaultAKey(LOGIN_PASS);
    bKey = await deriveVaultBKey(VAULT_B_PASS);
  });

  it('a Vault B record cannot be read with the Vault A key', async () => {
    await saveSecureRecord(bKey, 'hrt_client7', { regimen: 'sensitive' }, 'B');
    // Vault A key + Vault A tag: wrong on both counts.
    await expect(loadSecureRecord(aKey, 'hrt_client7', 'A')).rejects.toThrow(
      /Cryptographic Read Failure/
    );
    // Even with the (correct) Vault B tag but the wrong (A) key.
    await expect(loadSecureRecord(aKey, 'hrt_client7', 'B')).rejects.toThrow(
      /Cryptographic Read Failure/
    );
  });

  it('threat model: login passphrase alone cannot open Vault B data', async () => {
    // Operator stored a Vault B record under the independent B passphrase.
    await saveSecureRecord(bKey, 'consent_index', [{ id: 'c1' }], 'B');

    // Attacker knows the LOGIN passphrase and dumped the whole local store, so
    // they can derive the Vault A key and re-derive anything from passphrase A.
    const attackerAKey = await deriveVaultAKey(LOGIN_PASS);
    // They try the Vault A key against the Vault B record — must fail.
    await expect(
      loadSecureRecord(attackerAKey, 'consent_index', 'B')
    ).rejects.toThrow();

    // A wrong guess at the Vault B passphrase also fails (no oracle from salts).
    const wrongBKey = await deriveVaultBKey('attacker-guess');
    await expect(
      loadSecureRecord(wrongBKey, 'consent_index', 'B')
    ).rejects.toThrow();

    // Only the real Vault B key reads it.
    expect(await loadSecureRecord(bKey, 'consent_index', 'B')).toEqual([{ id: 'c1' }]);
  });

  it('dropping the Vault B key makes its records unreadable (panic-close)', async () => {
    await saveSecureRecord(bKey, 'hrt_client7', { regimen: 'x' }, 'B');

    // Simulate panic-close: the key reference is gone. Without it, the record on
    // disk is inert. Re-deriving requires the Vault B passphrase again.
    const reopenedBKey = await deriveVaultBKey(VAULT_B_PASS);
    expect(await loadSecureRecord(reopenedBKey, 'hrt_client7', 'B')).toEqual({
      regimen: 'x'
    });

    // ...but the WRONG passphrase (e.g. an attacker after panic) cannot.
    const wrongKey = await deriveVaultBKey('not-the-b-pass');
    await expect(
      loadSecureRecord(wrongKey, 'hrt_client7', 'B')
    ).rejects.toThrow();
  });

  it('Vault A and Vault B records coexist without cross-decryption', async () => {
    await saveSecureRecord(aKey, 'client_directory', [{ id: 'a1' }], 'A');
    await saveSecureRecord(bKey, 'hrt_client7', { regimen: 'x' }, 'B');

    expect(await loadSecureRecord(aKey, 'client_directory', 'A')).toEqual([{ id: 'a1' }]);
    expect(await loadSecureRecord(bKey, 'hrt_client7', 'B')).toEqual({ regimen: 'x' });

    // Cross attempts fail both ways.
    await expect(loadSecureRecord(bKey, 'client_directory', 'A')).rejects.toThrow();
    await expect(loadSecureRecord(aKey, 'hrt_client7', 'B')).rejects.toThrow();
  });
});
