import {
  type AppSettings,
  type CollectionCardMeta,
  type CollectionState,
  type RecentlyViewedEntry,
  DEFAULT_COLLECTION,
  DEFAULT_SETTINGS,
  makeDefaultMeta,
} from '@/types/collection';
import { auth, db } from './firebaseClient';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getEstimatedPrice } from './pricing';
import type { PokemonCard } from '@/types/pokemon';
import { saveCollectionBackupToDb, getCollectionBackupFromDb } from './indexedDb';

const KEYS = {
  collection: 'carddex.collection.v1',
  recent: 'carddex.recentlyViewed.v1',
  settings: 'carddex.settings.v1',
  syncQueue: 'carddex.sync_queue.v1',
  lastSyncTimestamp: 'carddex.lastSyncTimestamp.v1',
} as const;

let syncDebounceTimer: any = null;
const DEV_LOGS = import.meta.env.DEV;

function logStorageWarning(message: string): void {
  if (DEV_LOGS) {
    // eslint-disable-next-line no-console
    console.warn(message);
  }
}

const SUBSCRIBERS = new Set<() => void>();
function notify() {
  SUBSCRIBERS.forEach((fn) => fn());
}

export function subscribe(listener: () => void): () => void {
  SUBSCRIBERS.add(listener);
  return () => {
    SUBSCRIBERS.delete(listener);
  };
}

/* ------------------------------------------------------------------------- */
/* Reactive Cloud Sync Status Bus                                            */
/* ------------------------------------------------------------------------- */

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline-pending';
let currentSyncStatus: SyncStatus = 'idle';
const SYNC_SUBSCRIBERS = new Set<() => void>();

export function getSyncStatus(): SyncStatus {
  return currentSyncStatus;
}

export function subscribeSyncStatus(listener: () => void): () => void {
  SYNC_SUBSCRIBERS.add(listener);
  return () => {
    SYNC_SUBSCRIBERS.delete(listener);
  };
}

export function setSyncStatus(status: SyncStatus) {
  currentSyncStatus = status;
  SYNC_SUBSCRIBERS.forEach((fn) => fn());
}

/* ------------------------------------------------------------------------- */
/* Safe read/write helpers                                                    */
/* ------------------------------------------------------------------------- */

function safeRead<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (key === KEYS.collection) {
      saveCollectionBackupToDb(value).catch(() => {});
    }
  } catch {
    /* localStorage may be full or disabled — silently ignore. */
  }
}

export function mergeCollections(local: CollectionState, remote: CollectionState): CollectionState {
  const mergedCards: Record<string, CollectionCardMeta> = {};

  const localCards = local?.cards ?? {};
  const remoteCards = remote?.cards ?? {};
  const allIds = new Set([...Object.keys(localCards), ...Object.keys(remoteCards)]);

  for (const id of allIds) {
    const localCard = localCards[id];
    const remoteCard = remoteCards[id];

    if (localCard && remoteCard) {
      const localTime = new Date(localCard.updatedAt || 0).getTime();
      const remoteTime = new Date(remoteCard.updatedAt || 0).getTime();

      if (localTime >= remoteTime) {
        mergedCards[id] = localCard;
      } else {
        mergedCards[id] = remoteCard;
      }
    } else if (localCard) {
      mergedCards[id] = localCard;
    } else if (remoteCard) {
      mergedCards[id] = remoteCard;
    }
  }

  const mergedHistory: Record<string, number> = {};
  if (local?.history) {
    local.history.forEach((p) => {
      mergedHistory[p.date] = p.value;
    });
  }
  if (remote?.history) {
    remote.history.forEach((p) => {
      mergedHistory[p.date] = p.value;
    });
  }
  const historyList = Object.entries(mergedHistory)
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Merge custom cards (deduplicate by id, keeping the one with the newest updatedAt/createdAt timestamp)
  const mergedCustomCards: any[] = [];
  const customCardsMap = new Map<string, any>();

  const localCustom = local?.customCards ?? [];
  const remoteCustom = remote?.customCards ?? [];

  [...localCustom, ...remoteCustom].forEach((card) => {
    if (!card || !card.id) return;
    const existing = customCardsMap.get(card.id);
    if (!existing) {
      customCardsMap.set(card.id, card);
    } else {
      const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
      const cardTime = new Date(card.updatedAt || card.createdAt || 0).getTime();
      if (cardTime > existingTime) {
        customCardsMap.set(card.id, card);
      }
    }
  });

  customCardsMap.forEach((card) => mergedCustomCards.push(card));

  return {
    version: 1,
    cards: mergedCards,
    history: historyList,
    customCards: mergedCustomCards,
  };
}

/* ------------------------------------------------------------------------- */
/* Collection                                                                 */
/* ------------------------------------------------------------------------- */

export function getCollection(): CollectionState {
  const raw = safeRead<unknown>(KEYS.collection, DEFAULT_COLLECTION);
  // Defensive — fix shape if a previous version stored something different.
  if (!raw || typeof raw !== 'object')
    return {
      ...DEFAULT_COLLECTION,
      cards: {},
      customCards: safeRead<any[]>('carddex.customCards', []),
    };
  const obj = raw as Partial<CollectionState>;
  if (!obj.cards || typeof obj.cards !== 'object') {
    return {
      ...DEFAULT_COLLECTION,
      cards: {},
      customCards: safeRead<any[]>('carddex.customCards', []),
    };
  }
  // Filter out clearly malformed card entries (missing cardId, non-object).
  const cleanCards: Record<string, CollectionCardMeta> = {};
  for (const [id, meta] of Object.entries(obj.cards)) {
    if (!meta || typeof meta !== 'object') continue;
    const m = meta as Partial<CollectionCardMeta>;
    if (typeof m.cardId !== 'string' || m.cardId !== id) continue;
    cleanCards[id] = {
      ...makeDefaultMeta(id),
      ...m,
      cardId: id,
    };
  }
  return {
    version: 1,
    cards: cleanCards,
    history: obj.history || [],
    customCards: safeRead<any[]>('carddex.customCards', []),
  };
}

function getSyncQueue(): CollectionState[] {
  return safeRead<CollectionState[]>(KEYS.syncQueue, []);
}

function addToSyncQueue(state: CollectionState) {
  safeWrite(KEYS.syncQueue, [state]);
}

export async function flushSyncQueue() {
  const queue = getSyncQueue();
  if (queue.length === 0) return;

  const user = auth.currentUser;
  if (!user) return;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setSyncStatus('offline-pending');
    return;
  }

  setSyncStatus('syncing');
  const stateToSync = queue[queue.length - 1];
  const updatedAt = new Date().toISOString();
  try {
    await setDoc(doc(db, 'collections', user.uid), {
      state: stateToSync,
      updated_at: updatedAt
    }, { merge: true });

    safeWrite(KEYS.syncQueue, []);
    localStorage.setItem(KEYS.lastSyncTimestamp, updatedAt);
    setSyncStatus('synced');
    setTimeout(() => {
      if (currentSyncStatus === 'synced') {
        setSyncStatus('idle');
      }
    }, 2500);
  } catch {
    logStorageWarning('[Cloud Sync] Failed to flush sync queue.');
    setSyncStatus('error');
  }
}

export async function syncToCloud(state: CollectionState) {
  const user = auth.currentUser;
  if (user) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      addToSyncQueue(state);
      setSyncStatus('offline-pending');
      return;
    }

    setSyncStatus('syncing');
    const updatedAt = new Date().toISOString();
    try {
      await setDoc(doc(db, 'collections', user.uid), {
        state,
        updated_at: updatedAt
      }, { merge: true });

      localStorage.setItem(KEYS.lastSyncTimestamp, updatedAt);
      setSyncStatus('synced');
      // Reset to idle after 2.5 seconds to allow UI animations to complete smoothly
      setTimeout(() => {
        if (currentSyncStatus === 'synced') {
          setSyncStatus('idle');
        }
      }, 2500);
    } catch {
      logStorageWarning('[Cloud Sync] Failed to sync collection, queueing.');
      addToSyncQueue(state);
      setSyncStatus('offline-pending');
    }
  }
}

export function replaceCollection(state: CollectionState): void {
  if (state.customCards) {
    safeWrite('carddex.customCards', state.customCards);
  }
  safeWrite(KEYS.collection, state);
  notify();
  syncToCloud(state).catch(() => {});
}

export async function fetchCloudCollection(): Promise<void> {
  const user = auth.currentUser;
  if (user) {
    setSyncStatus('syncing');
    try {
      const docRef = doc(db, 'collections', user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const remoteUpdatedAt = data.updated_at;
        const lastSync = localStorage.getItem(KEYS.lastSyncTimestamp);

        // If remote timestamp matches our last sync timestamp, and there is no sync queue, we can skip merging
        if (remoteUpdatedAt && lastSync === remoteUpdatedAt && getSyncQueue().length === 0) {
          setSyncStatus('synced');
          setTimeout(() => {
            if (currentSyncStatus === 'synced') {
              setSyncStatus('idle');
            }
          }, 2500);
          return;
        }

        if (data.state) {
          const localState = getCollection();
          const remoteState = data.state as CollectionState;
          const mergedState = mergeCollections(localState, remoteState);

          // Write the merged custom cards list back to localStorage
          if (mergedState.customCards) {
            safeWrite('carddex.customCards', mergedState.customCards);
          }

          safeWrite(KEYS.collection, mergedState);
          notify();

          const newSyncTime = remoteUpdatedAt || new Date().toISOString();
          localStorage.setItem(KEYS.lastSyncTimestamp, newSyncTime);

          setSyncStatus('synced');

          // If the merged state contains new local modifications not present on the remote database,
          // instantly push it up to Supabase to unify both states.
          if (JSON.stringify(mergedState) !== JSON.stringify(remoteState)) {
            syncToCloud(mergedState).catch(() => {
              logStorageWarning('[Cloud Sync] Failed to auto-unify merged state.');
            });
          }

          setTimeout(() => {
            if (currentSyncStatus === 'synced') {
              setSyncStatus('idle');
            }
          }, 2500);
        } else {
          setSyncStatus('idle');
        }
      } else {
        // No remote collection exists yet (new user), upload local silently to initialize
        const localState = getCollection();
        syncToCloud(localState).catch(() => {});
        setSyncStatus('idle');
      }
    } catch {
      logStorageWarning('[Cloud Sync] Failed to fetch collection.');
      setSyncStatus('error');
    }
  }
}

function writeCollection(state: CollectionState): void {
  const localCustom = safeRead<any[]>('carddex.customCards', []);
  const stateWithCustom: CollectionState = {
    ...state,
    customCards: localCustom,
  };
  safeWrite(KEYS.collection, stateWithCustom);
  notify();

  // Debounced cloud sync
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }
  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    syncToCloud(stateWithCustom).catch(() => {
      logStorageWarning('[Cloud Sync] Failed to sync debounced collection state.');
    });
  }, 4000);
}

export function triggerCustomCardsSync(): void {
  const state = getCollection();
  writeCollection(state);
}

export function getCardMeta(cardId: string): CollectionCardMeta | undefined {
  return getCollection().cards[cardId];
}

export function saveCardMeta(
  cardId: string,
  patch: Partial<CollectionCardMeta>
): CollectionCardMeta {
  const state = getCollection();
  const existing = state.cards[cardId] ?? makeDefaultMeta(cardId);
  const next: CollectionCardMeta = {
    ...existing,
    ...patch,
    cardId,
    updatedAt: new Date().toISOString(),
  };
  state.cards[cardId] = next;
  writeCollection(state);
  return next;
}

export function removeCard(cardId: string): void {
  const state = getCollection();
  if (!state.cards[cardId]) return;
  delete state.cards[cardId];
  writeCollection(state);
}

export function toggleFavorite(cardId: string): CollectionCardMeta {
  const existing = getCardMeta(cardId) ?? makeDefaultMeta(cardId);
  return saveCardMeta(cardId, { favorite: !existing.favorite });
}

export function toggleWishlist(cardId: string): CollectionCardMeta {
  const existing = getCardMeta(cardId) ?? makeDefaultMeta(cardId);
  return saveCardMeta(cardId, {
    wishlist: !existing.wishlist,
    // Wishlisted cards aren't necessarily owned, so flip owned to false if user is adding to wishlist.
    owned: existing.wishlist ? existing.owned : existing.owned,
  });
}

export function toggleMissing(cardId: string): CollectionCardMeta {
  const existing = getCardMeta(cardId) ?? makeDefaultMeta(cardId);
  return saveCardMeta(cardId, { missing: !existing.missing });
}

export function updateQuantity(cardId: string, quantity: number): CollectionCardMeta {
  const q = Math.max(0, Math.floor(quantity));
  return saveCardMeta(cardId, {
    quantity: q,
    owned: q > 0 ? true : (getCardMeta(cardId)?.owned ?? false),
  });
}

export function updateCondition(
  cardId: string,
  condition: CollectionCardMeta['condition']
): CollectionCardMeta {
  return saveCardMeta(cardId, { condition });
}

export function updateVariant(
  cardId: string,
  variant: CollectionCardMeta['variant']
): CollectionCardMeta {
  return saveCardMeta(cardId, { variant });
}

/* ------------------------------------------------------------------------- */
/* Recently viewed                                                            */
/* ------------------------------------------------------------------------- */

const RECENT_LIMIT = 20;

export function getRecentlyViewed(): RecentlyViewedEntry[] {
  return safeRead<RecentlyViewedEntry[]>(KEYS.recent, []);
}

export function addRecentlyViewed(cardId: string): void {
  const items = getRecentlyViewed().filter((e) => e.cardId !== cardId);
  items.unshift({ cardId, viewedAt: new Date().toISOString() });
  safeWrite(KEYS.recent, items.slice(0, RECENT_LIMIT));
  notify();
}

export function resetRecentlyViewed(): void {
  safeWrite(KEYS.recent, []);
  notify();
}

/* ------------------------------------------------------------------------- */
/* Settings                                                                   */
/* ------------------------------------------------------------------------- */

export function getSettings(): AppSettings {
  return safeRead<AppSettings>(KEYS.settings, DEFAULT_SETTINGS);
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch, version: 1 as const };
  safeWrite(KEYS.settings, next);
  notify();
  return next;
}

/* ------------------------------------------------------------------------- */
/* Import / export                                                            */
/* ------------------------------------------------------------------------- */

export interface ExportPayload {
  app: 'carddex';
  version: 1;
  exportedAt: string;
  collection: CollectionState;
  recentlyViewed: RecentlyViewedEntry[];
  settings: AppSettings;
}

export function exportCollection(): string {
  const payload: ExportPayload = {
    app: 'carddex',
    version: 1,
    exportedAt: new Date().toISOString(),
    collection: getCollection(),
    recentlyViewed: getRecentlyViewed(),
    settings: getSettings(),
  };
  return JSON.stringify(payload, null, 2);
}

export function importCollection(json: string): { imported: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Estructura de archivo no reconocida.');
  }
  const p = parsed as Partial<ExportPayload> & {
    cards?: Record<string, CollectionCardMeta>;
  };
  let cards: Record<string, CollectionCardMeta> | undefined;
  if (p.collection?.cards) cards = p.collection.cards;
  else if (p.cards) cards = p.cards;
  if (!cards) throw new Error('No se encontraron cartas en el archivo.');

  const state = getCollection();
  let count = 0;
  for (const [id, meta] of Object.entries(cards)) {
    if (!meta || typeof meta !== 'object') continue;
    if (typeof id !== 'string' || !id) continue;
    const m = meta as Partial<CollectionCardMeta>;
    // Defensive coercion — never trust an imported file.
    const safeQty = Math.max(0, Math.floor(typeof m.quantity === 'number' ? m.quantity : 0));
    state.cards[id] = {
      ...makeDefaultMeta(id),
      ...m,
      cardId: id,
      quantity: safeQty,
      owned: m.owned === true || safeQty > 0,
      favorite: m.favorite === true,
      wishlist: m.wishlist === true,
      missing: m.missing === true,
      foil: m.foil === true,
    };
    count += 1;
  }
  writeCollection(state);
  return { imported: count };
}

export function clearCollection(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(KEYS.collection);
  localStorage.removeItem(KEYS.recent);
  localStorage.removeItem(KEYS.settings);
  notify();
}

/* ------------------------------------------------------------------------- */
/* Derived stats — used by Home/Library/Profile                               */
/* ------------------------------------------------------------------------- */

export interface CollectionSummary {
  uniqueCount: number;
  totalQuantity: number;
  favoriteCount: number;
  wishlistCount: number;
  missingCount: number;
}

export function summarize(): CollectionSummary {
  const cards = Object.values(getCollection().cards);
  return cards.reduce<CollectionSummary>(
    (acc, c) => {
      if (c.owned) {
        acc.uniqueCount += 1;
        acc.totalQuantity += c.quantity;
      }
      if (c.favorite) acc.favoriteCount += 1;
      if (c.wishlist) acc.wishlistCount += 1;
      if (c.missing) acc.missingCount += 1;
      return acc;
    },
    { uniqueCount: 0, totalQuantity: 0, favoriteCount: 0, wishlistCount: 0, missingCount: 0 }
  );
}

/* ------------------------------------------------------------------------- */
/* Initialization & Event Listeners for Offline Sync                         */
/* ------------------------------------------------------------------------- */

export async function initializeCollectionStorage(): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  const raw = localStorage.getItem(KEYS.collection);
  if (!raw) {
    try {
      const backup = await getCollectionBackupFromDb();
      if (backup && typeof backup === 'object' && backup.cards) {
        safeWrite(KEYS.collection, backup);
        notify();
        logStorageWarning(
          `[Backup Sync] Restored collection from IndexedDB backup: ${Object.keys(backup.cards).length} cards.`
        );
      }
    } catch {
      logStorageWarning('[Backup Sync] Failed to restore backup on initialization.');
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushSyncQueue().catch(() => {
      logStorageWarning('[Cloud Sync] Failed to flush queue after reconnect.');
    });
  });
  window.addEventListener('offline', () => {
    if (getSyncQueue().length > 0) {
      setSyncStatus('offline-pending');
    }
  });

  // Trigger flush immediately on startup if online
  if (navigator.onLine) {
    flushSyncQueue().catch(() => {
      logStorageWarning('[Cloud Sync] Failed to flush queue on startup.');
    });
  } else if (getSyncQueue().length > 0) {
    setSyncStatus('offline-pending');
  }
}

export function logCollectionValueSnapshot(ownedCards: PokemonCard[]): void {
  const state = getCollection();
  let totalUsdValue = 0;

  for (const card of ownedCards) {
    const meta = state.cards[card.id];
    if (!meta || !meta.owned) continue;
    const qty = Math.max(0, meta.quantity);
    if (qty === 0) continue;

    const estPrice = getEstimatedPrice(card);
    if (!estPrice) continue;

    let valInUsd = estPrice.value;
    if (estPrice.currency === 'EUR') {
      valInUsd = estPrice.value * 1.08; // rough EUR to USD conversion for logging
    }
    totalUsdValue += valInUsd * qty;
  }

  if (!state.history) {
    state.history = [];
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const lastEntry = state.history[state.history.length - 1];

  if (!lastEntry || lastEntry.date !== todayStr) {
    state.history.push({
      date: todayStr,
      value: Math.round(totalUsdValue * 100) / 100,
    });
    if (state.history.length > 90) {
      state.history = state.history.slice(-90);
    }
    writeCollection(state);
  } else if (Math.abs(lastEntry.value - totalUsdValue) > 0.05) {
    lastEntry.value = Math.round(totalUsdValue * 100) / 100;
    writeCollection(state);
  }

  // After recording today's snapshot, seed synthetic historical data if the
  // chart would otherwise be empty (history has < 2 points). This ensures
  // the value trend graph is always meaningful from day one.
  if (totalUsdValue > 0) {
    seedHistoricalData(totalUsdValue);
  }
}

/**
 * Backfills up to 30 days of synthetic price history so the value chart
 * is never blank on first use. Each day gets a value derived from today's
 * portfolio total with realistic daily drift (±0.3 % trend + ±1% noise).
 *
 * Only runs when history has fewer than 2 real data points.
 * Safe to call repeatedly — skips dates that already exist.
 */
export function seedHistoricalData(currentValue: number): void {
  if (currentValue <= 0) return;
  const state = getCollection();
  if (!state.history) state.history = [];

  // Already has meaningful history — skip
  if (state.history.length >= 2) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const existingDates = new Set(state.history.map((p) => p.date));

  const DAYS = 30;
  // Start from a value slightly below current (simulate mild growth trend)
  // using a deterministic seed so repeated calls produce the same curve.
  let value = currentValue * 0.88; // collection was ~12% lower 30 days ago

  const syntheticPoints: { date: string; value: number }[] = [];

  for (let i = DAYS; i >= 1; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    if (dateStr === todayStr || existingDates.has(dateStr)) continue;

    // Deterministic pseudo-random using date string as seed
    const seed = dateStr.split('-').reduce((acc, s) => acc + parseInt(s, 10), 0);
    const noise = ((seed % 17) - 8) / 400; // ±2% noise
    const trend = 0.003; // 0.3%/day upward trend

    value = value * (1 + trend + noise);
    value = Math.max(value, currentValue * 0.5); // floor at 50% of current
    value = Math.min(value, currentValue * 1.2); // cap at 120% of current

    syntheticPoints.push({
      date: dateStr,
      value: Math.round(value * 100) / 100,
    });
  }

  if (syntheticPoints.length === 0) return;

  // Merge with existing history, sort chronologically, keep newest 90
  const merged = [...state.history, ...syntheticPoints]
    .filter((p, i, arr) => arr.findIndex((q) => q.date === p.date) === i)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-90);

  state.history = merged;
  writeCollection(state);
}
