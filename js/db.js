// IndexedDB：資料只存在這支手機的瀏覽器裡，不會上傳到任何地方。

const DB_NAME = 'split-ledger';
const DB_VERSION = 1;
export const TABLES = ['friends', 'activities', 'expenses', 'repayments'];

let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const t of TABLES) {
        if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function getAll(table) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(table).objectStore(table).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 一次寫入多筆（同一個交易，要嘛全部成功、要嘛全部不算）。
 * ops：[{ table, put: 物件 } | { table, del: id } | { table, clear: true }]
 */
export async function write(ops) {
  if (!ops.length) return;
  const db = await open();
  const tables = [...new Set(ops.map((o) => o.table))];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(tables, 'readwrite');
    for (const op of ops) {
      const store = tx.objectStore(op.table);
      if (op.clear) store.clear();
      else if (op.del !== undefined) store.delete(op.del);
      else store.put(op.put);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** 請瀏覽器把資料標成「持續保存」，降低被系統自動清掉的機會 */
export async function requestPersist() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
