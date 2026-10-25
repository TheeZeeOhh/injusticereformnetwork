// dbRebuild.js
//
// Rebuilds an IndexedDB database from a copy of its LIVE rows, so bytes of
// deleted or overwritten rows stop existing in its files.
//
// Why: deleting a row does not erase it. The browser's SQLite backing store
// leaves the old cell in the page and the old page in the WAL, and JS cannot run
// VACUUM. The subpoena drill (2026-10-17) recovered a migrated-away Vault B
// client ref ('hrt_PT-…') from exactly that residue. Deleting the database
// unlinks its files; writing the live rows back produces files that never held
// the old bytes. (Blocks the filesystem freed are a raw-disk matter: full-disk
// encryption covers those, not this.)
//
// Crash safety. The live rows are first copied to a staging database in ONE
// transaction, together with a 'complete' marker, so staging is either a whole
// copy or nothing. Only then is the original deleted and rewritten. If anything
// stops between those steps, recoverInterruptedRebuild() (run before the
// database is next opened) finds the complete staging copy and finishes the
// job. Staging is removed only after the rewrite is verified by count.
//
// Staging holds the same ciphertext the original does, under the same ids.

const STAGING_SUFFIX = '__rebuild';

function done(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
    tx.onabort = (e) => reject(e.target.error || new Error('transaction aborted'));
  });
}

// Our connections close when someone else wants to delete or upgrade the
// database; otherwise deleteDatabase would wait on them forever.
function closeOnVersionChange(db) {
  db.onversionchange = () => db.close();
  return db;
}

function open(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = (e) => upgrade(e.target.result);
    req.onsuccess = (e) => resolve(closeOnVersionChange(e.target.result));
    req.onerror = (e) => reject(e.target.error);
  });
}

// Opens `name` only if it already exists; resolves null (and creates nothing)
// otherwise, by aborting the creation upgrade.
function openIfExists(name) {
  return new Promise((resolve, reject) => {
    let missing = false;
    const req = indexedDB.open(name);
    req.onupgradeneeded = (e) => {
      if (e.oldVersion === 0) {
        missing = true;
        req.transaction.abort();
      }
    };
    req.onsuccess = (e) => resolve(closeOnVersionChange(e.target.result));
    req.onerror = (e) => {
      if (missing) {
        e.preventDefault();
        resolve(null);
      } else {
        reject(e.target.error);
      }
    };
  });
}

function deleteDb(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

function createStore(spec) {
  return (db) => {
    if (!db.objectStoreNames.contains(spec.store)) {
      db.createObjectStore(spec.store, { keyPath: spec.keyPath, autoIncrement: !!spec.autoIncrement });
    }
  };
}

async function readAll(db, storeName) {
  const tx = db.transaction([storeName], 'readonly');
  const rows = await done(tx.objectStore(storeName).getAll());
  await txDone(tx);
  return rows || [];
}

// spec: { name, version, store, keyPath, autoIncrement }
export async function rebuildDatabase(spec) {
  const staging = spec.name + STAGING_SUFFIX;

  const src = await open(spec.name, spec.version, createStore(spec));
  const rows = await readAll(src, spec.store);
  src.close();

  // 1. Stage a complete copy atomically (any stale staging is discarded first:
  //    a complete one would already have been recovered at open).
  await deleteDb(staging);
  const st = await open(staging, 1, (db) => {
    db.createObjectStore('rows', { autoIncrement: true });
    db.createObjectStore('meta');
  });
  const tx = st.transaction(['rows', 'meta'], 'readwrite');
  for (const row of rows) tx.objectStore('rows').add(row);
  tx.objectStore('meta').put({ count: rows.length }, 'complete');
  await txDone(tx);
  st.close();

  // 2. Replace the original from the staged copy.
  await restoreFromStaging(spec);
  return { rows: rows.length };
}

async function restoreFromStaging(spec) {
  const staging = spec.name + STAGING_SUFFIX;
  const st = await openIfExists(staging);
  if (!st) return false;
  let meta;
  let rows = [];
  if (st.objectStoreNames.contains('meta') && st.objectStoreNames.contains('rows')) {
    const tx = st.transaction(['meta', 'rows'], 'readonly');
    meta = await done(tx.objectStore('meta').get('complete'));
    rows = (await done(tx.objectStore('rows').getAll())) || [];
    await txDone(tx);
  }
  st.close();
  if (!meta || rows.length !== meta.count) {
    // Staging never completed, so the original was never touched.
    await deleteDb(staging);
    return false;
  }

  await deleteDb(spec.name);
  const db = await open(spec.name, spec.version, createStore(spec));
  const wtx = db.transaction([spec.store], 'readwrite');
  for (const row of rows) wtx.objectStore(spec.store).put(row);
  await txDone(wtx);
  const ctx = db.transaction([spec.store], 'readonly');
  const n = await done(ctx.objectStore(spec.store).count());
  await txDone(ctx);
  db.close();
  if (n !== meta.count) {
    // Keep staging: the next open retries the restore from it.
    throw new Error(`rebuild of ${spec.name} wrote ${n} of ${meta.count} rows; staging kept`);
  }
  await deleteDb(staging);
  return true;
}

// Finishes a rebuild a crash interrupted. Call before opening `spec.name`.
// Resolves true if it restored the database from staging.
export function recoverInterruptedRebuild(spec) {
  return restoreFromStaging(spec);
}
