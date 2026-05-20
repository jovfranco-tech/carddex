import type { PokemonCard } from '@/types/pokemon';

const DB_NAME = 'carddex-db';
const DB_VERSION = 1;
const STORE_NAME = 'cards';

function getDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Window object is not defined.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function saveCardToDb(card: PokemonCard): Promise<void> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({
        id: card.id,
        card,
        timestamp: Date.now(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[IndexedDB] Failed to save card:', err);
  }
}

export async function getCardFromDb(id: string): Promise<PokemonCard | null> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.card : null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[IndexedDB] Failed to get card:', err);
    return null;
  }
}

export async function getAllCardsFromDb(): Promise<{ id: string; card: PokemonCard; timestamp: number }[]> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[IndexedDB] Failed to get all cards:', err);
    return [];
  }
}

export async function pruneCardsDb(maxCount = 1000): Promise<void> {
  try {
    const all = await getAllCardsFromDb();
    if (all.length <= maxCount) return;

    // Sort oldest first
    all.sort((a, b) => a.timestamp - b.timestamp);
    const toDelete = all.slice(0, all.length - maxCount);

    const db = await getDb();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    toDelete.forEach((item) => {
      store.delete(item.id);
    });
  } catch (err) {
    console.error('[IndexedDB] Failed to prune cards database:', err);
  }
}

export async function clearCardsDb(): Promise<void> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[IndexedDB] Failed to clear cards database:', err);
  }
}
