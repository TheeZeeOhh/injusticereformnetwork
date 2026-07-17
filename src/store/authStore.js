import { create } from 'zustand';
import {
  deriveVaultAKey,
  deriveVaultBKey,
  createOrVerifyPassphrase,
  vaultExists,
  vaultBEnrolled
} from '../utils/cryptoEngine';
import {
  migrateRecordsToV2,
  rekeyVaultB as rekeyVaultBRecords,
  vaultHasRecords
} from '../utils/migrationEngine';
import { passphraseRejectionReason } from '../utils/passphrasePolicy';
import { initAuditKey, clearAuditKey, appendEntry } from '../utils/auditLog';

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
      if (!passphrase) {
        throw new Error("Passphrase required.");
      }
      // Enforce the strength policy only on FIRST enrollment (finding H3).
      // Returning users may hold a legacy passphrase that predates the policy —
      // locking them out would destroy their data, so we only gate new vaults.
      if (!vaultExists()) {
        const reason = passphraseRejectionReason(passphrase, { userInputs: [username] });
        if (reason) throw new Error(reason);
      }

      // 1. Derive the VAULT A key only (passphrase A). Vault B requires a
      //    separate passphrase and is opened later, on demand.
      const vaultAKey = await deriveVaultAKey(passphrase);

      // 2. Enroll (first login) or verify against Vault A's encrypted verifier.
      //    A wrong passphrase fails the AES-GCM auth check here and is rejected
      //    before any real record is decrypted. recordsExist guards against
      //    silently re-enrolling over orphaned records (finding H1).
      const recordsExist = !vaultExists() ? await vaultHasRecords('A') : false;
      const isValid = await createOrVerifyPassphrase(vaultAKey, 'A', { recordsExist });

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

      // Install the RAM-only audit key so vault access is logged confidentially
      // (sealed under this key, never persisted). Non-fatal if it fails.
      try {
        await initAuditKey(passphrase);
      } catch (aErr) {
        console.warn('Audit key init failed; access logging will be skipped:', aErr);
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
      if (!passphraseB) {
        throw new Error("Vault B passphrase required.");
      }
      // On first-ever Vault B enrollment, enforce the strength policy. On later
      // unlocks it is a challenge against the existing verifier, so we don't
      // re-gate strength (that would lock out a legacy B passphrase).
      if (!vaultBEnrolled()) {
        const reason = passphraseRejectionReason(passphraseB);
        if (reason) throw new Error(reason);
      }
      const vaultBKey = await deriveVaultBKey(passphraseB);
      // Guard against silent re-enrollment over orphaned Vault B records (H1).
      // Legacy installs with existing B records must go through the re-key
      // upgrade (rekeyVaultB), not a plain enroll — so refuse enroll here if B
      // records already exist without a B verifier.
      const bRecordsExist = !vaultBEnrolled() ? await vaultHasRecords('B') : false;
      const ok = await createOrVerifyPassphrase(vaultBKey, 'B', { recordsExist: bRecordsExist });
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
      appendEntry({ action: 'admin', recordId: 'vaultB_unlock', vaultTag: 'B' });
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
      appendEntry({ action: 'admin', recordId: 'vaultB_rekey', vaultTag: 'B' });
      return true;
    } catch (err) {
      set({ vaultBError: err.message });
      return false;
    }
  },

  // Manual Panic / BridgeVault Closure. Drops the Vault B key reference (finding
  // M4). Note: the derived AES key is a NON-EXTRACTABLE CryptoKey, so its raw
  // bytes live in the engine's internal memory, never in the JS heap — JS cannot
  // overwrite them, and dropping the reference makes the key GC-eligible rather
  // than deterministically scrubbed. Deterministic zeroization requires holding
  // the key in Rust (see docs/model2-hardware-vault-b.md, step 2). The passphrase
  // was never cached, so Vault B data is inaccessible until re-entry regardless.
  panicWipeVaultB: () => {
    // Record the seal event for chain-of-custody ("Vault B sealed at HH:MM").
    // The audit key stays in RAM (only full logout clears it), so this seals.
    appendEntry({ action: 'admin', recordId: 'vaultB_panic_close', vaultTag: 'B' });
    set({ vaultBKey: null, vaultBError: null });
  },

  completeOnboarding: () => {
    set({ isOnboarded: true });
  },

  logout: () => {
    // Drop all key references from RAM. As with panicWipeVaultB, these are
    // non-extractable CryptoKeys — dereferenced here and GC-eligible, not
    // deterministically zeroized (finding M4; true zeroize is the Rust custody
    // work). Passphrases were never cached.
    clearAuditKey(); // audit log becomes ciphertext-with-no-key after logout
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
