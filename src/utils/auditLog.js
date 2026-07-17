// Tamper-evident, confidential access log.
//
// Every vault read/write/delete appends an entry to a hash-chained log so an
// operator can PROVE, after the fact, which records were accessed and when — and
// prove the log itself has not been edited. Each entry commits to the previous
// (hash = SHA-256(prevHash + ts + sealed)), so altering or deleting any past
// entry breaks the chain and verifyChain() reports it.
//
// CONFIDENTIALITY (why the sensitive fields are ENCRYPTED, not plaintext):
// an entry like {read, client_PT-1234, vaultTag: B} discloses that a specific
// client's 42 CFR Part 2 (SUD) vault was accessed on a given date — and under
// Part 2 the mere existence of that access is itself the protected fact. The log
// is also designed to survive nukeStorage. A plaintext log would therefore be a
// subpoena gift that survives a panic-wipe. So each entry's sensitive fields are
// sealed under a RAM-only, non-extractable audit key (deriveAuditKey), which is
// never persisted; after logout / panic / seizure the log is ciphertext with no
// key on disk. The hash chain runs over the SEALED payload, so tamper-evidence
// holds WITHOUT any plaintext: integrity does not require readability.

import { deriveAuditKey } from './cryptoEngine';

const DB_NAME = 'SanctuaryAudit';
const STORE_NAME = 'auditLog';
const DB_VERSION = 1;
const GENESIS_HASH = '0'.repeat(64);

// RAM-only key set at login, cleared at logout / panic. Never written to disk.
let auditKey = null;

/** Install the RAM-only audit key (call at login after passphrase A is known). */
export async function initAuditKey(passphraseA) {
  auditKey = await deriveAuditKey(passphraseA);
}

/** Drop the audit key from RAM (call at logout / panic-close). */
export function clearAuditKey() {
  auditKey = null;
}

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (e) => reject(e.target.error);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'seq', autoIncrement: true });
      }
    };
  });
}

async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
function fromBase64(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// Seal the sensitive fields under the RAM-only audit key. Returns base64(IV||ct).
async function seal(fields) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(fields));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, auditKey, pt));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return toBase64(out);
}

async function unseal(sealedB64) {
  if (!auditKey) return null; // locked: contents are unreadable without the key
  try {
    const raw = fromBase64(sealedB64);
    const iv = raw.subarray(0, 12);
    const ct = raw.subarray(12);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, auditKey, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    return null;
  }
}

function getLastEntry(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const cursorReq = tx.objectStore(STORE_NAME).openCursor(null, 'prev');
    cursorReq.onsuccess = (e) => resolve(e.target.result ? e.target.result.value : null);
    cursorReq.onerror = (e) => reject(e.target.error);
  });
}

// Serialized append queue. appendEntry callers are fire-and-forget, so without
// serialization two near-simultaneous appends could both read the same prevHash
// and FORK the chain — which verifyChain would then (correctly) flag as
// tampering even though it was only concurrency. Chaining each append onto the
// previous promise guarantees one entry commits before the next reads prevHash.
let appendChain = Promise.resolve();

async function doAppend({ action, recordId, vaultTag }) {
  if (!auditKey) {
    // No key in RAM (not logged in): we cannot seal, and writing plaintext would
    // reintroduce the disclosure. Skip rather than leak.
    return null;
  }
  const db = await initDB();
  const last = await getLastEntry(db);
  const prevHash = last ? last.hash : GENESIS_HASH;
  const ts = new Date().toISOString();
  const sealed = await seal({ action, recordId, vaultTag: vaultTag || null });
  // Chain over ts + sealed ciphertext — no plaintext needed for integrity.
  const hash = await sha256Hex(prevHash + ts + sealed);
  const entry = { ts, prevHash, sealed, hash };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const req = tx.objectStore(STORE_NAME).add(entry);
    req.onsuccess = () => resolve({ ...entry, seq: req.result });
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Append a tamper-evident entry (metadata only — never record contents). Sealed
 * under the RAM-only audit key. Serialized against concurrent appends. Never
 * throws into the caller (logging must not break a vault operation).
 */
export function appendEntry(meta) {
  const next = appendChain.then(() => doAppend(meta)).catch((err) => {
    console.warn('Audit log append failed (non-fatal):', err);
    return null;
  });
  // Keep the queue alive regardless of this entry's outcome.
  appendChain = next.then(() => undefined, () => undefined);
  return next;
}

/**
 * All entries in chain order (oldest first), with sensitive fields DECRYPTED
 * when the audit key is in RAM. When locked, action/recordId/vaultTag come back
 * null (the entry envelope + timestamp remain, but its subject is unreadable).
 */
export async function getEntries() {
  const db = await initDB();
  const rows = await new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
  const out = [];
  for (const row of rows) {
    const fields = await unseal(row.sealed);
    out.push({
      seq: row.seq,
      ts: row.ts,
      locked: fields === null,
      action: fields?.action ?? null,
      recordId: fields?.recordId ?? null,
      vaultTag: fields?.vaultTag ?? null,
    });
  }
  return out;
}

/**
 * Recompute the chain from genesis over the sealed payloads and confirm every
 * link. Works WITHOUT the audit key (integrity is independent of readability).
 * Returns { ok, count, brokenAtSeq }.
 */
export async function verifyChain() {
  const db = await initDB();
  const rows = await new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
  let prevHash = GENESIS_HASH;
  for (const row of rows) {
    if (row.prevHash !== prevHash) {
      return { ok: false, count: rows.length, brokenAtSeq: row.seq };
    }
    const expected = await sha256Hex(prevHash + row.ts + row.sealed);
    if (expected !== row.hash) {
      return { ok: false, count: rows.length, brokenAtSeq: row.seq };
    }
    prevHash = row.hash;
  }
  return { ok: true, count: rows.length, brokenAtSeq: null };
}
