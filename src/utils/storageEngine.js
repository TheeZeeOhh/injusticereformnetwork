import { encryptRecord, decryptRecord, buildRecordAad, vaultBStorageId } from './cryptoEngine';
import { appendEntry } from './auditLog';
import { rebuildDatabase, recoverInterruptedRebuild } from './dbRebuild';

const DB_NAME = 'SanctuaryVault';
const STORE_NAME = 'encryptedRecords';
const DB_VERSION = 1;
const DB_SPEC = { name: DB_NAME, version: DB_VERSION, store: STORE_NAME, keyPath: 'id' };

// Every open waits on this gate: first for recovery of a rebuild a crash
// interrupted, later for any rebuild in progress (compactRecordStore), so no
// read or write lands while the database is being replaced.
let gate = null;
function awaitGate() {
  if (!gate) {
    gate = recoverInterruptedRebuild(DB_SPEC).catch((err) => {
      console.warn('Interrupted vault rebuild could not be recovered yet:', err);
    });
  }
  return gate;
}

// Initialize IndexedDB
async function initDB() {
  await awaitGate();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (e) => reject(`IndexedDB error: ${e.target.errorCode}`);
    
    // Close when a delete/rebuild needs the database, instead of blocking it.
    request.onsuccess = (e) => {
      const db = e.target.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // We use string IDs (e.g. 'client_8942') as primary keys
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

// Low-level DB operation wrapper
async function dbOperation(mode, callback) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], mode);
    const store = transaction.objectStore(STORE_NAME);
    
    let result;
    const request = callback(store);
    
    if (request) {
      request.onsuccess = () => { result = request.result; };
      request.onerror = (e) => { reject(e.target.error); };
    }

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = (e) => reject(e.target.error);
  });
}

// The IndexedDB key a record is stored under. IndexedDB keys are plaintext on
// disk, so Vault B records use an opaque HMAC id (see vaultBStorageId); the
// logical id is still what the AAD binds, so a blob moved between opaque ids
// fails authentication. Vault A and the hive keep their readable ids.
export async function storageIdFor(key, recordId, vaultTag) {
  return vaultTag === 'B' ? vaultBStorageId(key, recordId) : recordId;
}

/**
 * Encrypts a JSON payload using the provided AES-GCM RAM key and stores it
 * offline in IndexedDB.
 *
 * `vaultTag` ('A' | 'B') binds the record's identity into the ciphertext as AAD
 * (finding C2): the resulting v2 blob only decrypts under this same
 * (vaultTag, recordId) pair, so it cannot be relocated to another id or replayed
 * across vaults. Pass the vault whose key you supplied ('B' for Vault B modules).
 */
export async function saveSecureRecord(key, recordId, payload, vaultTag) {
  try {
    const storeId = await storageIdFor(key, recordId, vaultTag);
    const aad = buildRecordAad(vaultTag, recordId);
    const encryptedPayload = await encryptRecord(key, payload, aad);
    await dbOperation('readwrite', store => {
      return store.put({ id: storeId, data: encryptedPayload });
    });
    // Tamper-evident audit trail (metadata only, never PHI). Fire-and-forget so
    // logging can never block or fail a vault write. Vault B logs the opaque
    // id: the audit key comes from passphrase A, so a logical id here would
    // hand Vault B's client refs to anyone who has only passphrase A.
    appendEntry({ action: 'write', recordId: storeId, vaultTag });
    return true;
  } catch (err) {
    console.error("Failed to save secure record:", err);
    throw new Error("Cryptographic Write Failure");
  }
}

/**
 * Loads and decrypts a record from IndexedDB using the provided AES-GCM RAM key.
 *
 * `vaultTag` ('A' | 'B') reconstructs the AAD used at write time. Legacy v1
 * records ignore AAD (they predate C2 and decrypt as before); v2 records require
 * the matching (vaultTag, recordId), so a wrong tag or a relocated blob fails
 * authentication and surfaces as a read failure.
 */
export async function loadSecureRecord(key, recordId, vaultTag) {
  try {
    const storeId = await storageIdFor(key, recordId, vaultTag);
    const record = await dbOperation('readonly', store => {
      return store.get(storeId);
    });

    if (!record || !record.data) return null;

    const aad = buildRecordAad(vaultTag, recordId);
    const decryptedPayload = await decryptRecord(key, record.data, aad);
    // Log the successful read of an existing record (metadata only, never PHI).
    appendEntry({ action: 'read', recordId: storeId, vaultTag });
    return decryptedPayload;
  } catch (err) {
    console.error("Failed to load/decrypt secure record:", err);
    throw new Error("Cryptographic Read Failure. The data may be corrupt or the keys mismatch.");
  }
}

/**
 * Returns every stored record as [{ id, data }], where `data` is the raw
 * AES-GCM ciphertext payload (Uint8Array). Used by the backup engine so PHI is
 * never decrypted during export — the backup carries only ciphertext.
 */
export async function getAllRecords() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Writes a raw record ({ id, data }) back into the store without re-encrypting.
 * Used by restore to reinstate verified ciphertext exactly as it was exported.
 */
export async function putRawRecord(record) {
  return dbOperation('readwrite', (store) => store.put(record));
}

/**
 * Deletes one record by its stored id. Deliberately NOT audited: its only
 * caller removes legacy Vault B records whose ids are the very client refs the
 * audit log must not carry (the migration logs one summary entry instead).
 */
export async function deleteRawRecord(id) {
  return dbOperation('readwrite', (store) => store.delete(id));
}

/**
 * Rebuilds the record database from its live rows, so deleted rows (such as
 * legacy Vault B records under readable ids) stop existing in its files. See
 * dbRebuild.js. Reads and writes wait until it finishes.
 */
export async function compactRecordStore() {
  const run = awaitGate().then(() => rebuildDatabase(DB_SPEC));
  gate = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * Destroys all stored data. Used in catastrophic failure scenarios.
 */
export async function nukeStorage() {
  // Record the wipe in the SEPARATE audit DB (which this does not delete), so a
  // scorched-earth event remains provable afterward. Await so it lands first.
  await appendEntry({ action: 'delete', recordId: '*ALL*', vaultTag: null });
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e);
  });
}
