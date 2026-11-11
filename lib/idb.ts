// Tiny IndexedDB key-value helper, used to keep the draft (including images) on this device.
const DB = 'framely';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    return await run<T>('readonly', (s) => s.get(key));
  } catch {
    return undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    await run('readwrite', (s) => s.put(value, key));
  } catch {
    // Storage unavailable (e.g. private mode): the draft just won't persist.
  }
}

export async function idbDel(key: string): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(key));
  } catch {
    // ignore
  }
}
