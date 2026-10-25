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
import { rebuildDatabase, recoverInterruptedRebuild } from './dbRebuild';

const DB_NAME = 'SanctuaryAudit';
const STORE_NAME = 'auditLog';
const DB_VERSION = 1;
const GENESIS_HASH = '0'.repeat(64);
const DB_SPEC = { name: DB_NAME, version: DB_VERSION, store: STORE_NAME, keyPath: 'seq', autoIncrement: true };

// Opens wait on recovery of an interrupted rebuild, and on a rebuild in
// progress (rewriteVaultBEntryIds compacts the log after re-sealing).
let gate = null;
function awaitGate() {
  if (!gate) {
    gate = recoverInterruptedRebuild(DB_SPEC).catch((err) => {
      console.warn('Interrupted audit log rebuild could not be recovered yet:', err);
    });
  }
  return gate;
}

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

async function initDB() {
  await awaitGate();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (e) => reject(e.target.error);
    request.onsuccess = (e) => {
      const db = e.target.result;
      db.onversionchange = () => db.close(); // never block a rebuild or delete
      resolve(db);
    };
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

function getAllRows(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

// Recomputes the chain over `rows` (in order). Returns the seq of the first bad
// link, or null if every link holds.
async function firstBrokenSeq(rows) {
  let prevHash = GENESIS_HASH;
  for (const row of rows) {
    if (row.prevHash !== prevHash) return row.seq;
    if ((await sha256Hex(prevHash + row.ts + row.sealed)) !== row.hash) return row.seq;
    prevHash = row.hash;
  }
  return null;
}

// Vault B read/write/delete entries written before opaque storage ids name the
// record by its readable id ('hrt_PT-1234'). The audit key comes from
// passphrase A, so those entries disclosed Vault B's client refs to anyone
// holding only passphrase A. This re-seals each such entry with the id mapped
// through `mapId` (logical id -> opaque id) and rebuilds the chain, keeping
// every seq and timestamp.
//
// Rewriting history is a deliberate act, so it is guarded and recorded:
//   - it refuses to run on a chain that already fails verification (it must
//     never launder tampering into a valid-looking chain);
//   - the rewrite is ONE IndexedDB transaction, so it lands whole or not at all;
//   - it appends a sealed marker entry carrying the pre-rewrite head hash, so
//     the change itself is on the record.
// Entries the current audit key cannot open are left untouched and counted.
// Returns { rewritten, unreadable } or { rewritten: 0, refused: 'chain broken' }.
export function rewriteVaultBEntryIds(mapId) {
  const next = appendChain.then(() => doRewrite(mapId));
  appendChain = next.then(() => undefined, () => undefined);
  return next;
}

async function doRewrite(mapId) {
  if (!auditKey) return { rewritten: 0, unreadable: 0 };
  const db = await initDB();
  const rows = await getAllRows(db);
  if ((await firstBrokenSeq(rows)) !== null) return { rewritten: 0, refused: 'chain broken' };

  let rewritten = 0;
  let unreadable = 0;
  const sealedOut = [];
  for (const row of rows) {
    const fields = await unseal(row.sealed);
    if (fields === null) { unreadable += 1; sealedOut.push(row.sealed); continue; }
    const needs = fields.vaultTag === 'B' && fields.action !== 'admin' &&
      typeof fields.recordId === 'string' && !fields.recordId.startsWith('vb_') &&
      fields.recordId !== '*ALL*';
    if (!needs) { sealedOut.push(row.sealed); continue; }
    sealedOut.push(await seal({ ...fields, recordId: await mapId(fields.recordId) }));
    rewritten += 1;
  }
  if (rewritten === 0) return { rewritten, unreadable };

  const oldHead = rows[rows.length - 1].hash;
  let prevHash = GENESIS_HASH;
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const { seq, ts } = rows[i];
    const sealed = sealedOut[i];
    const hash = await sha256Hex(prevHash + ts + sealed);
    out.push({ seq, ts, prevHash, sealed, hash });
    prevHash = hash;
  }
  await new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const row of out) store.put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
    tx.onabort = (e) => reject(e.target.error || new Error('audit rewrite aborted'));
  });
  await doAppend({ action: 'admin', recordId: `audit_vaultB_ids_rewritten:${rewritten}:prevHead:${oldHead}`, vaultTag: 'B' });
  // The replaced entries are still openable with passphrase A, and SQLite keeps
  // their bytes after an overwrite. Rebuild the log so they are gone from disk.
  // Runs inside the append queue, so no entry can land mid-rebuild.
  const run = rebuildDatabase(DB_SPEC);
  gate = run.then(() => undefined, () => undefined);
  await run;
  return { rewritten, unreadable, compacted: true };
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
