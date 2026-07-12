const CRYPTO_CONFIG = {
  KDF_ITERATIONS: 600000,
  HASH_ALGO: 'SHA-256',
  ENCRYPTION_ALGO: 'AES-GCM',
  KEY_LENGTH: 256,
  TAG_LENGTH: 128,
};

// Per-install random salts. Salts are NOT secret — they only need to be
// unique per installation and STABLE across logins, so that two installs with
// the same passphrase never derive the same keys, while previously-encrypted
// records on this install remain decryptable. Generated once, then persisted.
const SALT_STORAGE_KEY = 'sanctuary_vault_salts_v1';
const SALT_BYTES = 16;

function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// Detect the Tauri runtime. Inside the desktop app we persist salts in the OS
// keychain; in a plain browser (dev) we fall back to localStorage so `npm run
// dev` still works. The fallback is intentionally documented, not silent.
function isTauri() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
}

async function readSaltStore() {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke('get_vault_salts'); // string | null
  }
  return localStorage.getItem(SALT_STORAGE_KEY);
}

async function writeSaltStore(json) {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_vault_salts', { saltsJson: json });
    return;
  }
  localStorage.setItem(SALT_STORAGE_KEY, json);
}

// Parses saltA (Uint8Array) out of a salt-store JSON string, for restore-time
// verification against a backup's own salts without persisting them.
export function saltAFromStoreJson(json) {
  try {
    const { saltA } = JSON.parse(json);
    return saltA ? fromBase64(saltA) : null;
  } catch {
    return null;
  }
}

// Generates and persists this device's unique per-install salts if they don't
// yet exist. Real work: after this runs, the salt store is populated. Called
// during onboarding so key setup is genuine, not theater. Returns nothing
// sensitive (salts are non-secret).
export async function ensureSaltsInitialized() {
  await getOrCreateSalts();
}

// Exports the raw salt-store JSON (or null) for inclusion in a portable backup.
// Salts are NOT secret; they must accompany a backup so it can be restored and
// verified on a different device (whose own salts would otherwise differ).
export async function exportSaltStore() {
  return readSaltStore();
}

// Installs a salt-store JSON (from a backup) so that key/HMAC derivation on this
// device matches the origin device. Called during restore BEFORE deriving keys.
export async function importSaltStore(json) {
  if (json) await writeSaltStore(json);
}

// Returns { saltA, saltB } as Uint8Array, generating and persisting them on
// first use. Distinct salts per vault keep Vault A and Vault B keys independent.
// Salts are stored in the OS keychain under Tauri, else localStorage in dev.
async function getOrCreateSalts() {
  const stored = await readSaltStore();
  if (stored) {
    try {
      const { saltA, saltB } = JSON.parse(stored);
      if (saltA && saltB) {
        return { saltA: fromBase64(saltA), saltB: fromBase64(saltB) };
      }
    } catch {
      // Corrupt salt record — fall through and regenerate. Note: any records
      // encrypted under the previous (unreadable) salts would be unrecoverable,
      // but a corrupt salt store already implies that.
    }
  }
  const saltA = window.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const saltB = window.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  await writeSaltStore(
    JSON.stringify({ saltA: toBase64(saltA), saltB: toBase64(saltB) })
  );
  return { saltA, saltB };
}

// Derives an HMAC-SHA-256 signing key from the passphrase, using a distinct
// context salt so it is cryptographically independent of the vault encryption
// keys. This key signs backup files; only a holder of the passphrase can
// produce or verify a valid signature, giving tamper-detection that travels
// with the operator rather than the device.
// `saltAOverride` (Uint8Array) lets restore verify a backup against ITS OWN
// salts without persisting them to this device first — so a failed verification
// never mutates local state.
export async function deriveHmacKey(passphrase, saltAOverride) {
  const enc = new TextEncoder();
  const saltA = saltAOverride || (await getOrCreateSalts()).saltA;
  // Domain-separate from the vault keys by appending a fixed context to saltA.
  const hmacSalt = new Uint8Array([...saltA, ...enc.encode('HMAC_BACKUP_CTX')]);

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: hmacSalt,
      iterations: CRYPTO_CONFIG.KDF_ITERATIONS,
      hash: CRYPTO_CONFIG.HASH_ALGO
    },
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

// Returns a base64 HMAC-SHA-256 signature over the given string.
export async function signData(hmacKey, dataString) {
  const sig = await window.crypto.subtle.sign(
    'HMAC',
    hmacKey,
    new TextEncoder().encode(dataString)
  );
  return toBase64(new Uint8Array(sig));
}

// Verifies a base64 HMAC signature against the data. WebCrypto's verify is
// constant-time, avoiding timing side-channels on the tag comparison.
export async function verifyData(hmacKey, dataString, signatureB64) {
  try {
    return await window.crypto.subtle.verify(
      'HMAC',
      hmacKey,
      fromBase64(signatureB64),
      new TextEncoder().encode(dataString)
    );
  } catch {
    return false;
  }
}

export async function deriveVaultKeys(passphrase) {
  const enc = new TextEncoder();
  const { saltA, saltB } = await getOrCreateSalts();

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const vaultAKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltA,
      iterations: CRYPTO_CONFIG.KDF_ITERATIONS,
      hash: CRYPTO_CONFIG.HASH_ALGO
    },
    keyMaterial,
    { name: CRYPTO_CONFIG.ENCRYPTION_ALGO, length: CRYPTO_CONFIG.KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );

  const vaultBKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltB,
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

// Passphrase verification via an encrypted verifier blob.
//
// On first-ever login (no verifier stored) we ENROLL: encrypt a known constant
// under the derived Vault A key and persist the ciphertext. Whatever passphrase
// is used first becomes the vault's passphrase (trust-on-first-use).
//
// On subsequent logins we CHALLENGE: attempt to decrypt the stored verifier
// with the freshly derived key. AES-GCM authentication makes a wrong passphrase
// fail here (the auth tag won't validate), so we can reject it BEFORE any real
// record is touched. The verifier is ciphertext — not secret — so localStorage
// is an acceptable, stable home in both browser and Tauri.
const VERIFIER_STORAGE_KEY = 'sanctuary_vault_verifier_v1';
const VERIFIER_PLAINTEXT = 'SANCTUARY_VAULT_VERIFIER';

// True once a vault has been enrolled on this device (a verifier exists). Used
// to decide first-run onboarding vs. returning-user login. Not a security
// check — just a "has this device been set up yet?" signal.
export function vaultExists() {
  return localStorage.getItem(VERIFIER_STORAGE_KEY) !== null;
}

export async function createOrVerifyPassphrase(vaultAKey) {
  const stored = localStorage.getItem(VERIFIER_STORAGE_KEY);

  if (stored) {
    // CHALLENGE: try to decrypt the existing verifier.
    try {
      const payload = fromBase64(stored);
      const decoded = await decryptRecord(vaultAKey, payload);
      return decoded === VERIFIER_PLAINTEXT;
    } catch {
      // Auth tag failed to validate → wrong passphrase.
      return false;
    }
  }

  // ENROLL: no verifier yet — create one under this key.
  const payload = await encryptRecord(vaultAKey, VERIFIER_PLAINTEXT);
  localStorage.setItem(VERIFIER_STORAGE_KEY, toBase64(payload));
  return true;
}

// Convert string to Uint8Array buffer
const encodeText = (text) => new TextEncoder().encode(text);
const decodeText = (buffer) => new TextDecoder().decode(buffer);

// Encrypt JSON serializable data using AES-GCM
export async function encryptRecord(cryptoKey, data) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedData = encodeText(JSON.stringify(data));

  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: CRYPTO_CONFIG.ENCRYPTION_ALGO, iv },
    cryptoKey,
    encodedData
  );

  // Combine IV and CipherText so they can be stored together
  const payload = new Uint8Array(iv.length + cipherBuffer.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(cipherBuffer), iv.length);
  return payload;
}

// Decrypt combined IV+CipherText payload using AES-GCM
export async function decryptRecord(cryptoKey, payload) {
  const iv = payload.slice(0, 12);
  const cipherBuffer = payload.slice(12);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: CRYPTO_CONFIG.ENCRYPTION_ALGO, iv },
    cryptoKey,
    cipherBuffer
  );

  return JSON.parse(decodeText(decryptedBuffer));
}
