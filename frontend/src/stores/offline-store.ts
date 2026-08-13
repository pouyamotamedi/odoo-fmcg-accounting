/**
 * Offline Store - IndexedDB queue for offline POS transactions
 * When the app is offline, transactions are stored in IndexedDB
 * and replayed when connectivity is restored.
 */

const DB_NAME = 'fmcg-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-transactions';

export interface OfflineTransaction {
  id?: number;
  timestamp: number;
  lines: { product_id: number; qty: number; price_unit: number }[];
  payment_method: 'cash' | 'card' | 'credit';
  partner_id?: number;
  credit_note?: string;
  total: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Add a transaction to the offline queue */
export async function queueTransaction(tx: Omit<OfflineTransaction, 'id' | 'timestamp'>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.add({ ...tx, timestamp: Date.now() });
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

/** Get all pending transactions */
export async function getPendingTransactions(): Promise<OfflineTransaction[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/** Remove a transaction from the queue after successful sync */
export async function removeTransaction(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

/** Get count of pending transactions */
export async function getPendingCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.count();
    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/** Replay all pending transactions (called when back online) */
export async function replayPendingTransactions(
  submitFn: (tx: OfflineTransaction) => Promise<void>
): Promise<{ success: number; failed: number }> {
  const pending = await getPendingTransactions();
  let success = 0;
  let failed = 0;

  for (const tx of pending) {
    try {
      await submitFn(tx);
      if (tx.id) await removeTransaction(tx.id);
      success++;
    } catch (e: any) {
      // If error contains "already exists" or "duplicate", remove from queue (already synced before)
      const msg = e?.message || '';
      if (msg.includes('already') || msg.includes('duplicate') || msg.includes('UNIQUE')) {
        if (tx.id) await removeTransaction(tx.id);
        success++; // Count as success since it was already submitted
      } else {
        failed++;
      }
    }
  }

  return { success, failed };
}
