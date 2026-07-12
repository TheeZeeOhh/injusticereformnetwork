import { create } from 'zustand';
import { deriveVaultKeys, createOrVerifyPassphrase } from '../utils/cryptoEngine';

export const useAuthStore = create((set, get) => ({
  user: null, // Basic demographics (non-sensitive)
  isAuthenticated: false,
  isOnboarded: false,
  isDecrypting: false,
  error: null,
  
  // Volatile Memory Keys (NEVER stored in LocalStorage)
  vaultAKey: null,
  vaultBKey: null,

  loginWithPassphrase: async (username, passphrase, role) => {
    set({ isDecrypting: true, error: null });

    try {
      if (passphrase.length < 8) {
        throw new Error("Passphrase too short. Minimum 8 characters required.");
      }

      // 1. Derive keys using PBKDF2 (600,000 iterations)
      const { vaultAKey, vaultBKey } = await deriveVaultKeys(passphrase);

      // 2. Enroll (first login) or verify against the stored encrypted verifier.
      //    A wrong passphrase fails the AES-GCM auth check here and is rejected
      //    before any real record is decrypted.
      const isValid = await createOrVerifyPassphrase(vaultAKey);

      if (!isValid) {
        throw new Error("Incorrect passphrase. Vault decryption denied.");
      }

      // 3. Keep keys only in active volatile RAM
      set({ 
        user: { username, role: role || 'Lead Navigator' }, 
        isAuthenticated: true,
        vaultAKey,
        vaultBKey,
        isDecrypting: false 
      });
      
    } catch (err) {
      set({ error: err.message, isDecrypting: false });
    }
  },

  // Manual Panic / BridgeVault Closure
  panicWipeVaultB: () => {
    // Overwrites the sensitive Vault B key in memory
    set({ vaultBKey: null });
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
      error: null
    });
  },
}));
