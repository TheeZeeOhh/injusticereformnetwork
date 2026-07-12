import { encryptRecord, decryptRecord } from './cryptoEngine';

const DB_NAME = 'SanctuaryVault';
const STORE_NAME = 'encryptedRecords';
const DB_VERSION = 1;

// Initialize IndexedDB
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (e) => reject(`IndexedDB error: ${e.target.errorCode}`);
    
    request.onsuccess = (e) => resolve(e.target.result);

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

/**
 * Encrypts a JSON payload using the provided AES-GCM RAM key and stores it offline in IndexedDB.
 */
export async function saveSecureRecord(key, recordId, payload) {
  try {
    const encryptedPayload = await encryptRecord(key, payload);
    await dbOperation('readwrite', store => {
      return store.put({ id: recordId, data: encryptedPayload });
    });
    return true;
  } catch (err) {
    console.error("Failed to save secure record:", err);
    throw new Error("Cryptographic Write Failure");
  }
}

/**
 * Loads and decrypts a record from IndexedDB using the provided AES-GCM RAM key.
 */
export async function loadSecureRecord(key, recordId) {
  try {
    const record = await dbOperation('readonly', store => {
      return store.get(recordId);
    });
    
    if (!record || !record.data) return null;
    
    const decryptedPayload = await decryptRecord(key, record.data);
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
 * Destroys all stored data. Used in catastrophic failure scenarios.
 */
export async function nukeStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e);
  });
}
