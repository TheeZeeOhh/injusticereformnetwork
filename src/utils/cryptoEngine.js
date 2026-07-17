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

// Chunked base64 encode. Spreading a whole Uint8Array into
// String.fromCharCode(...bytes) throws RangeError once the array exceeds the
// engine's argument limit (~64-128k), so we build the binary string in fixed
// slices (finding L1). Correctness fix for large records/backups.
function toBase64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  const CHUNK = 0x8000; // 32k elements per fromCharCode call
  for (let i = 0; i < arr.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, arr.subarray(i, i + CHUNK));
  }
  return btoa(binary);
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

  // A PRESENT-but-corrupt salt store must NOT be silently overwritten (finding
  // L2). Regenerating salts would derive different keys and permanently orphan
  // every record encrypted under the old salts, with no warning or consent. We
  // throw so the caller can surface the problem and the operator can recover the
  // salt store (e.g. from a backup) or make an informed decision.
  if (stored !== null && stored !== undefined && stored !== '') {
    let parsed;
    try {
      parsed = JSON.parse(stored);
    } catch {
      throw new Error(
        'Vault salt store is corrupt and cannot be parsed. Refusing to ' +
        'regenerate salts, which would make all existing records ' +
        'permanently unreadable. Restore the salt store from a backup.'
      );
    }
    if (parsed && parsed.saltA && parsed.saltB) {
      return { saltA: fromBase64(parsed.saltA), saltB: fromBase64(parsed.saltB) };
    }
    throw new Error(
      'Vault salt store is present but missing saltA/saltB. Refusing to ' +
      'regenerate salts (that would orphan all existing records). Restore the ' +
      'salt store from a backup.'
    );
  }

  // Genuinely empty store (first run on this device) — generate and persist.
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

// Derives a single AES-256-GCM vault key from a passphrase and a specific salt.
// Non-extractable: the raw key bytes never enter the JS heap.
async function deriveKeyFromPassphrase(passphrase, salt) {
  const enc = new TextEncoder();
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
      salt,
      iterations: CRYPTO_CONFIG.KDF_ITERATIONS,
      hash: CRYPTO_CONFIG.HASH_ALGO
    },
    keyMaterial,
    { name: CRYPTO_CONFIG.ENCRYPTION_ALGO, length: CRYPTO_CONFIG.KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

// Vault A key: derived from the PRIMARY passphrase and saltA.
export async function deriveVaultAKey(passphraseA) {
  const { saltA } = await getOrCreateSalts();
  return deriveKeyFromPassphrase(passphraseA, saltA);
}

// Vault B key: derived from an INDEPENDENT passphrase and saltB (finding C1).
// Because Vault B is keyed on its own secret — not merely a different salt on the
// same passphrase — a holder of passphrase A alone cannot re-derive it, and
// panic-closing Vault B is cryptographically meaningful. Vault B is unrecoverable
// by design: there is no escrow, so a forgotten passphrase B means Vault B data
// is permanently inaccessible.
export async function deriveVaultBKey(passphraseB) {
  const { saltB } = await getOrCreateSalts();
  return deriveKeyFromPassphrase(passphraseB, saltB);
}

// Derives the LEGACY (pre-C1) Vault B key: on old installs Vault B records were
// encrypted under the LOGIN passphrase plus saltB (there was no separate Vault B
// passphrase). The re-key upgrade (task #8) uses this to decrypt those records
// once, before re-encrypting them under the new independent Vault B passphrase.
export async function deriveLegacyVaultBKey(loginPassphrase) {
  const { saltB } = await getOrCreateSalts();
  return deriveKeyFromPassphrase(loginPassphrase, saltB);
}

// DEPRECATED (pre-C1): derives BOTH vault keys from ONE passphrase. Retained only
// so existing callers keep working until the auth flow is migrated to the split
// passphrases (task #9). Under C1 this does NOT provide real vault separation —
// use deriveVaultAKey / deriveVaultBKey instead.
export async function deriveVaultKeys(passphrase) {
  const { saltA, saltB } = await getOrCreateSalts();
  const vaultAKey = await deriveKeyFromPassphrase(passphrase, saltA);
  const vaultBKey = await deriveKeyFromPassphrase(passphrase, saltB);
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
const VERIFIER_PLAINTEXT = 'SANCTUARY_VAULT_VERIFIER';
// Vault A keeps the original storage key for backward compatibility with
// installs enrolled before C1. Vault B gets its own verifier so passphrase B can
// be validated at unlock time (also closes finding M1).
const VERIFIER_STORAGE_KEY_A = 'sanctuary_vault_verifier_v1';
const VERIFIER_STORAGE_KEY_B = 'sanctuary_vault_b_verifier_v1';

function verifierStorageKey(vaultTag) {
  if (vaultTag === 'A') return VERIFIER_STORAGE_KEY_A;
  if (vaultTag === 'B') return VERIFIER_STORAGE_KEY_B;
  throw new Error(`Invalid vaultTag '${vaultTag}': expected 'A' or 'B'.`);
}

// True once Vault A has been enrolled on this device (its verifier exists). Used
// to decide first-run onboarding vs. returning-user login. Not a security
// check — just a "has this device been set up yet?" signal.
export function vaultExists() {
  return localStorage.getItem(VERIFIER_STORAGE_KEY_A) !== null;
}

// True once Vault B has its own verifier (i.e. an independent Vault B passphrase
// has been enrolled under C1). Distinguishes a C1-migrated install from a legacy
// one whose Vault B still shares the Vault A passphrase.
export function vaultBEnrolled() {
  return localStorage.getItem(VERIFIER_STORAGE_KEY_B) !== null;
}

// Enroll-or-challenge a vault's passphrase via its encrypted verifier blob.
//
// If no verifier exists for this vault (ENROLL): encrypt a known constant under
// the derived key and persist it. If one exists (CHALLENGE): try to decrypt it;
// AES-GCM authentication makes a wrong passphrase fail (bad auth tag), so we can
// reject BEFORE any real record is touched. The verifier is ciphertext, not
// secret, so localStorage is an acceptable, stable home.
//
// `vaultKey` is the derived key for `vaultTag` ('A' | 'B'). The verifier is
// sealed WITHOUT record AAD (it is not a vault record and has no recordId), so a
// plain encryptRecord/decryptRecord round-trip is used.
//
// `opts.recordsExist` (boolean) guards against silent re-enrollment (finding
// H1). If NO verifier is stored but the caller reports that encrypted records
// for this vault already exist, the verifier was lost/cleared/corrupted — NOT a
// genuine first run. Silently enrolling here would derive a new key that
// permanently orphans those records (and would let a local attacker pre-seed a
// passphrase over someone else's data). We refuse and throw instead of enrolling.
// The caller (which can see IndexedDB) supplies recordsExist; cryptoEngine stays
// free of a storage dependency (avoids an import cycle).
export async function createOrVerifyPassphrase(vaultKey, vaultTag = 'A', opts = {}) {
  const storageKey = verifierStorageKey(vaultTag);
  const stored = localStorage.getItem(storageKey);

  if (stored) {
    // CHALLENGE: try to decrypt the existing verifier.
    try {
      const payload = fromBase64(stored);
      const decoded = await decryptRecord(vaultKey, payload);
      return decoded === VERIFIER_PLAINTEXT;
    } catch {
      // Auth tag failed to validate → wrong passphrase.
      return false;
    }
  }

  // No verifier stored. Genuine first run only if there are also no records.
  if (opts.recordsExist) {
    throw new Error(
      `Vault ${vaultTag} has existing encrypted records but its passphrase ` +
      `verifier is missing. Refusing to enroll a new passphrase, which would ` +
      `permanently orphan those records. Restore the verifier (and salts) from ` +
      `a backup, or clear the vault deliberately if this data is expendable.`
    );
  }

  // ENROLL: no verifier and no records — create one under this key.
  const payload = await encryptRecord(vaultKey, VERIFIER_PLAINTEXT);
  localStorage.setItem(storageKey, toBase64(payload));
  return true;
}

// Convert string to Uint8Array buffer
const encodeText = (text) => new TextEncoder().encode(text);
const decodeText = (buffer) => new TextDecoder().decode(buffer);

// --- Record envelope versioning ---
//
// v1 (legacy): IV(12) || ciphertext          — no version marker, no AAD.
// v2 (current): MAGIC(4) || IV(12) || ciphertext — AAD-capable (see C2).
//
// The v2 magic is a distinctive 4-byte prefix so the reader can tell v2 from a
// legacy v1 payload whose first bytes are a *random* 12-byte IV. A random IV
// matching all four magic bytes has probability ~2^-32, so misdetecting a v1
// blob as v2 is effectively impossible. A single ambiguous version byte would
// collide with a v1 IV 1-in-256 of the time, so we use four bytes instead.
//
// "SA" (0x53 0x41) = Sanctuary, 0x02 = envelope version, 0x00 = reserved.
// The whole magic is fed into the v2 AAD (when AAD is used) so the version
// cannot be stripped or downgraded without failing the GCM auth tag.
const V2_MAGIC = new Uint8Array([0x53, 0x41, 0x02, 0x00]);

function hasV2Magic(payload) {
  if (payload.length < V2_MAGIC.length) return false;
  for (let i = 0; i < V2_MAGIC.length; i++) {
    if (payload[i] !== V2_MAGIC[i]) return false;
  }
  return true;
}

// True if a stored payload is already in the v2 (AAD-capable) envelope. Used by
// the migration pass to skip records that have already been upgraded, making the
// migration idempotent and re-runnable.
export function isV2Payload(payload) {
  return hasV2Magic(payload);
}

// Builds the canonical AAD (Additional Authenticated Data) that binds a v2
// record to the exact slot it may occupy (finding C2). The AAD is not secret —
// it is authenticated, not encrypted — so a record's ciphertext only validates
// under the same (vaultTag, recordId) it was sealed with. Relocating a blob to a
// different id, or replaying a Vault B blob into a Vault A slot, fails the GCM
// auth tag.
//
// vaultTag must be 'A' or 'B'; recordId is the IndexedDB key. The literal
// 'sanctuaryv2|' domain-separates this scheme from any future one.
export function buildRecordAad(vaultTag, recordId) {
  if (vaultTag !== 'A' && vaultTag !== 'B') {
    throw new Error(`Invalid vaultTag '${vaultTag}': expected 'A' or 'B'.`);
  }
  if (typeof recordId !== 'string' || recordId.length === 0) {
    throw new Error('recordId must be a non-empty string for AAD binding.');
  }
  return new TextEncoder().encode(`sanctuaryv2|${vaultTag}|${recordId}`);
}

// Encrypt JSON serializable data using AES-256-GCM into a v2 envelope.
//
// `aad` (optional Uint8Array) is bound as AES-GCM additionalData. Task #1 keeps
// it as a passthrough — callers do not yet supply it; the AAD *content*
// (record-id/vault binding, finding C2) is wired in a later task. When present,
// the V2 magic is prepended to the AAD so the envelope version is authenticated.
export async function encryptRecord(cryptoKey, data, aad) {
  // Random 96-bit IV per encryption. AES-GCM leaks catastrophically on IV REUSE
  // under the same key, and random 96-bit IVs hit the birthday bound near ~2^32
  // encryptions per key (finding M2). At this app's scale — a handful of records
  // per client, encrypted individually — that ceiling is unreachable, so random
  // IVs are safe here. If per-key encryption volume ever approached that range,
  // switch to a deterministic counter-based nonce. Documented, intentionally not
  // changed.
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedData = encodeText(JSON.stringify(data));

  const algo = { name: CRYPTO_CONFIG.ENCRYPTION_ALGO, iv };
  if (aad) {
    algo.additionalData = new Uint8Array([...V2_MAGIC, ...aad]);
  }

  const cipherBuffer = await window.crypto.subtle.encrypt(
    algo,
    cryptoKey,
    encodedData
  );

  // MAGIC(4) || IV(12) || ciphertext, stored together.
  const payload = new Uint8Array(
    V2_MAGIC.length + iv.length + cipherBuffer.byteLength
  );
  payload.set(V2_MAGIC, 0);
  payload.set(iv, V2_MAGIC.length);
  payload.set(new Uint8Array(cipherBuffer), V2_MAGIC.length + iv.length);
  return payload;
}

// Decrypt a record payload, transparently handling BOTH envelope formats:
//   - v2 (MAGIC || IV || ct): AAD-aware. If the record was sealed with AAD, the
//     same `aad` must be supplied here or GCM authentication fails.
//   - v1 (IV || ct): legacy, no AAD. Read as-is so existing records keep
//     working until the migration pass rewrites them to v2.
export async function decryptRecord(cryptoKey, payload, aad) {
  const isV2 = hasV2Magic(payload);

  const offset = isV2 ? V2_MAGIC.length : 0;
  const iv = payload.slice(offset, offset + 12);
  const cipherBuffer = payload.slice(offset + 12);

  const algo = { name: CRYPTO_CONFIG.ENCRYPTION_ALGO, iv };
  if (isV2 && aad) {
    algo.additionalData = new Uint8Array([...V2_MAGIC, ...aad]);
  }

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    algo,
    cryptoKey,
    cipherBuffer
  );

  return JSON.parse(decodeText(decryptedBuffer));
}
