import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  deriveVaultAKey,
  deriveVaultBKey,
  createOrVerifyPassphrase,
  vaultExists,
  vaultBEnrolled,
  encryptRecord,
  decryptRecord
} from './cryptoEngine';

// Task #7 — Vault B key split + independent verifier (finding C1, Model 1).
//
// The core guarantee: Vault B is keyed on its OWN passphrase, so a holder of
// passphrase A alone cannot derive or open Vault B.

// In-memory localStorage shim (salts + verifiers live here in dev/tests).
function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

// AES-GCM keys are non-extractable, so we can't compare them directly. Instead
// we prove key equality/inequality behaviourally: a record sealed under one key
// decrypts under an "equal" key and fails under a different one.
async function sealsInteroperablyWith(keyEnc, keyDec) {
  const blob = await encryptRecord(keyEnc, { probe: 1 });
  try {
    const out = await decryptRecord(keyDec, blob);
    return out && out.probe === 1;
  } catch {
    return false;
  }
}

describe('Vault B key split (C1)', () => {
  beforeEach(() => {
    installLocalStorage();
    vi.restoreAllMocks();
  });

  it('derives DIFFERENT keys for A and B from different passphrases', async () => {
    const a = await deriveVaultAKey('passphrase-A-strong');
    const b = await deriveVaultBKey('passphrase-B-different');
    // A blob sealed under A must NOT open under B, and vice versa.
    expect(await sealsInteroperablyWith(a, b)).toBe(false);
    expect(await sealsInteroperablyWith(b, a)).toBe(false);
    // Each key is self-consistent.
    expect(await sealsInteroperablyWith(a, a)).toBe(true);
    expect(await sealsInteroperablyWith(b, b)).toBe(true);
  });

  it('Vault B key is NOT derivable from passphrase A alone', async () => {
    const realB = await deriveVaultBKey('the-real-B-passphrase');
    // An attacker who only knows passphrase A tries to reach Vault B by deriving
    // the B key from A. It must not match the real B key.
    const forgedB = await deriveVaultBKey('passphrase-A-strong');
    const blob = await encryptRecord(realB, { sensitive: true });
    await expect(decryptRecord(forgedB, blob)).rejects.toThrow();
  });

  it('same passphrase still yields distinct A and B keys (independent salts)', async () => {
    const a = await deriveVaultAKey('same-pass');
    const b = await deriveVaultBKey('same-pass');
    // Even with an identical passphrase, saltA != saltB keeps the keys distinct.
    expect(await sealsInteroperablyWith(a, b)).toBe(false);
  });
});

describe('independent verifiers (C1 + M1)', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('enrolls then challenges Vault A and Vault B separately', async () => {
    const a = await deriveVaultAKey('pass-A');
    const b = await deriveVaultBKey('pass-B');

    expect(vaultExists()).toBe(false);
    expect(vaultBEnrolled()).toBe(false);

    // First calls ENROLL each vault's verifier.
    expect(await createOrVerifyPassphrase(a, 'A')).toBe(true);
    expect(await createOrVerifyPassphrase(b, 'B')).toBe(true);
    expect(vaultExists()).toBe(true);
    expect(vaultBEnrolled()).toBe(true);

    // Subsequent calls CHALLENGE: correct keys pass.
    expect(await createOrVerifyPassphrase(a, 'A')).toBe(true);
    expect(await createOrVerifyPassphrase(b, 'B')).toBe(true);
  });

  it('rejects a wrong Vault B passphrase at the verifier', async () => {
    const b = await deriveVaultBKey('correct-B');
    await createOrVerifyPassphrase(b, 'B'); // enroll

    const wrongB = await deriveVaultBKey('WRONG-B');
    expect(await createOrVerifyPassphrase(wrongB, 'B')).toBe(false);
  });

  it("Vault A's passphrase does not satisfy Vault B's verifier", async () => {
    const a = await deriveVaultAKey('pass-A');
    const b = await deriveVaultBKey('pass-B');
    await createOrVerifyPassphrase(a, 'A');
    await createOrVerifyPassphrase(b, 'B');

    // Presenting the Vault A key against Vault B's verifier must fail.
    expect(await createOrVerifyPassphrase(a, 'B')).toBe(false);
  });

  it('defaults to Vault A when no vaultTag is given (back-compat)', async () => {
    const a = await deriveVaultAKey('pass-A');
    expect(await createOrVerifyPassphrase(a)).toBe(true); // enroll A
    expect(vaultExists()).toBe(true);
    expect(vaultBEnrolled()).toBe(false);
  });
});
