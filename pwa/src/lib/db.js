/**
 * LabPass PWA — IndexedDB Wrapper
 *
 * Stores Google accounts locally on the phone.
 * Schema: accounts store { email (key), displayName, pictureUrl, idToken, addedAt }
 */

const DB_NAME = 'labpass';
const DB_VERSION = 1;
const ACCOUNTS_STORE = 'accounts';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(ACCOUNTS_STORE)) {
        db.createObjectStore(ACCOUNTS_STORE, { keyPath: 'email' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAccounts() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ACCOUNTS_STORE, 'readonly');
    const store = tx.objectStore(ACCOUNTS_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addAccount({ email, displayName, pictureUrl, idToken }) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ACCOUNTS_STORE, 'readwrite');
    const store = tx.objectStore(ACCOUNTS_STORE);
    const record = {
      email,
      displayName: displayName || email,
      pictureUrl: pictureUrl || null,
      idToken: idToken || null,
      addedAt: new Date().toISOString(),
    };

    const request = store.put(record); // upsert
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
}

export async function removeAccount(email) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ACCOUNTS_STORE, 'readwrite');
    const store = tx.objectStore(ACCOUNTS_STORE);
    const request = store.delete(email);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAccount(email) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ACCOUNTS_STORE, 'readonly');
    const store = tx.objectStore(ACCOUNTS_STORE);
    const request = store.get(email);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}
