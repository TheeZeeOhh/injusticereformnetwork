// sanctuary_crypto.js
// AES-256-GCM & PBKDF2 (600,000 iterations) Implementation for DVUA

const CRYPTO_CONFIG = {
  KDF_ITERATIONS: 600000,
  HASH_ALGO: 'SHA-256',
  ENCRYPTION_ALGO: 'AES-GCM',
  KEY_LENGTH: 256,
  TAG_LENGTH: 128, // 16 bytes auth tag for GCM
};

/**
 * Derives Vault A and Vault B keys from a single master passphrase using distinct salts.
 */
export async function deriveVaultKeys(passphrase, saltA, saltB) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const vaultAKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(saltA),
      iterations: CRYPTO_CONFIG.KDF_ITERATIONS,
      hash: CRYPTO_CONFIG.HASH_ALGO
    },
    keyMaterial,
    { name: CRYPTO_CONFIG.ENCRYPTION_ALGO, length: CRYPTO_CONFIG.KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );

  const vaultBKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(saltB),
      iterations: CRYPTO_CONFIG.KDF_ITERATIONS,
      hash: CRYPTO_CONFIG.HASH_ALGO
    },
    keyMaterial,
    { name: CRYPTO_CONFIG.ENCRYPTION_ALGO, length: CRYPTO_CONFIG.KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );

  return { vaultAKey, vaultBKey };
}

/**
 * Encrypts data using AES-256-GCM. Returns IV + Ciphertext (which includes the auth tag).
 */
export async function encryptData(key, plaintextData) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV recommended for GCM
  
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: CRYPTO_CONFIG.ENCRYPTION_ALGO,
      iv: iv,
      tagLength: CRYPTO_CONFIG.TAG_LENGTH
    },
    key,
    enc.encode(JSON.stringify(plaintextData))
  );

  return {
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext))
  };
}

/**
 * Decrypts AES-256-GCM data and verifies authenticity tag.
 */
export async function decryptData(key, ivArray, ciphertextArray) {
  const dec = new TextDecoder();
  const iv = new Uint8Array(ivArray);
  const ciphertext = new Uint8Array(ciphertextArray);

  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: CRYPTO_CONFIG.ENCRYPTION_ALGO,
        iv: iv,
        tagLength: CRYPTO_CONFIG.TAG_LENGTH
      },
      key,
      ciphertext
    );
    return JSON.parse(dec.decode(decrypted));
  } catch (e) {
    throw new Error("Decryption failed. Data tampered with or incorrect key/vault.");
  }
}
