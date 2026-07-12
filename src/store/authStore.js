import { create } from 'zustand';
import {
  deriveVaultAKey,
  deriveVaultBKey,
  createOrVerifyPassphrase
} from '../utils/cryptoEngine';
import { migrateRecordsToV2, rekeyVaultB as rekeyVaultBRecords } from '../utils/migrationEngine';

export const useAuthStore = create((set) => ({
  user: null, // Basic demographics (non-sensitive)
  isAuthenticated: false,
  isOnboarded: false,
  isDecrypting: false,
  error: null,

  // Volatile Memory Keys (NEVER stored in LocalStorage).
  // Under C1 Model 1, Vault A opens at login; Vault B stays CLOSED (key null)
  // until an explicit unlockVaultB with its OWN passphrase.
  vaultAKey: null,
  vaultBKey: null,
  vaultBError: null,

  loginWithPassphrase: async (username, passphrase, role) => {
    set({ isDecrypting: true, error: null });

    try {
      if (passphrase.length < 8) {
        throw new Error("Passphrase too short. Minimum 8 characters required.");
      }

      // 1. Derive the VAULT A key only (passphrase A). Vault B requires a
      //    separate passphrase and is opened later, on demand.
      const vaultAKey = await deriveVaultAKey(passphrase);

      // 2. Enroll (first login) or verify against Vault A's encrypted verifier.
      //    A wrong passphrase fails the AES-GCM auth check here and is rejected
      //    before any real record is decrypted.
      const isValid = await createOrVerifyPassphrase(vaultAKey, 'A');

      if (!isValid) {
        throw new Error("Incorrect passphrase. Vault decryption denied.");
      }

      // 3. One-time, idempotent upgrade of any legacy v1 records to v2 (AAD
      //    identity binding, finding C2). Vault B is closed here, so B records
      //    are skipped and migrated later when Vault B is unlocked. A single bad
      //    record is logged, not fatal — migration never blocks login.
      try {
        await migrateRecordsToV2(vaultAKey, null);
      } catch (mErr) {
        console.warn('v1->v2 record migration pass did not complete cleanly:', mErr);
      }

      // 4. Keep the Vault A key only in active volatile RAM. Vault B stays null.
      set({
        user: { username, role: role || 'Lead Navigator' },
        isAuthenticated: true,
        vaultAKey,
        vaultBKey: null,
        vaultBError: null,
        isDecrypting: false
      });

    } catch (err) {
      set({ error: err.message, isDecrypting: false });
    }
  },

  // Explicitly open Vault B with its INDEPENDENT passphrase (finding C1).
  //   - First-ever use ENROLLS this passphrase as Vault B's (trust-on-first-use,
  //     mirroring Vault A). The caller shows the unrecoverable-by-design warning.
  //   - Thereafter it CHALLENGES: a wrong passphrase fails the Vault B verifier
  //     and Vault B stays closed.
  // On success the Vault B key is held in RAM until panic-close or logout. The
  // passphrase itself is never cached, so re-opening always requires re-entry.
  // Returns true on success, false on failure.
  unlockVaultB: async (passphraseB) => {
    set({ vaultBError: null });
    try {
      if (!passphraseB || passphraseB.length < 8) {
        throw new Error("Vault B passphrase too short. Minimum 8 characters.");
      }
      const vaultBKey = await deriveVaultBKey(passphraseB);
      const ok = await createOrVerifyPassphrase(vaultBKey, 'B');
      if (!ok) {
        throw new Error("Incorrect Vault B passphrase. Vault B stays closed.");
      }

      // Now that Vault B is open, upgrade any legacy v1 Vault B records to v2.
      try {
        await migrateRecordsToV2(null, vaultBKey);
      } catch (mErr) {
        console.warn('Vault B v1->v2 migration did not complete cleanly:', mErr);
      }

      set({ vaultBKey });
      return true;
    } catch (err) {
      set({ vaultBError: err.message });
      return false;
    }
  },

  // One-time Vault B re-key for LEGACY installs (finding C1). Old Vault B records
  // were encrypted under the login passphrase; this decrypts them with the login
  // passphrase, enrolls the new independent Vault B passphrase, and re-encrypts
  // them under the new key. On success Vault B is left OPEN under the new key.
  // Returns true on success, false on failure (state left untouched on failure).
  rekeyVaultB: async (loginPassphrase, newPassphraseB) => {
    set({ vaultBError: null });
    try {
      await rekeyVaultBRecords(loginPassphrase, newPassphraseB);
      // Re-key succeeded — open Vault B under the new passphrase.
      const vaultBKey = await deriveVaultBKey(newPassphraseB);
      set({ vaultBKey });
      return true;
    } catch (err) {
      set({ vaultBError: err.message });
      return false;
    }
  },

  // Manual Panic / BridgeVault Closure. Drops the Vault B key from RAM. The
  // passphrase was never cached, so Vault B data is cryptographically
  // inaccessible until the operator re-enters passphrase B via unlockVaultB.
  panicWipeVaultB: () => {
    set({ vaultBKey: null, vaultBError: null });
  },

  completeOnboarding: () => {
    set({ isOnboarded: true });
  },

  logout: () => {
    // Instantly wipe all keys from RAM
    set({
      user: null,
      isAuthenticated: false,
      isOnboarded: false,
      vaultAKey: null,
      vaultBKey: null,
      vaultBError: null,
      error: null
    });
  },
}));
