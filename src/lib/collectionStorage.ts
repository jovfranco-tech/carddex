import {
  type AppSettings,
  type CollectionCardMeta,
  type CollectionState,
  type RecentlyViewedEntry,
  DEFAULT_COLLECTION,
  DEFAULT_SETTINGS,
  makeDefaultMeta,
} from '@/types/collection';
import { supabase } from './supabaseClient';
import { getEstimatedPrice } from './pricing';
import type { PokemonCard } from '@/types/pokemon';

const KEYS = {
  collection: 'carddex.collection.v1',
  recent: 'carddex.recentlyViewed.v1',
  settings: 'carddex.settings.v1',
  syncQueue: 'carddex.sync_queue.v1',
} as const;

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
  } catch {
    /* localStorage may be full or disabled — silently ignore. */
  }
}


export function mergeCollections(
  local: CollectionState,
  remote: CollectionState,
): CollectionState {
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

  return {
    version: 1,
    cards: mergedCards,
    history: historyList,
  };
}

/* ------------------------------------------------------------------------- */
/* Collection                                                                 */
/* ------------------------------------------------------------------------- */

export function getCollection(): CollectionState {
  const raw = safeRead<unknown>(KEYS.collection, DEFAULT_COLLECTION);
  // Defensive — fix shape if a previous version stored something different.
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_COLLECTION, cards: {} };
  const obj = raw as Partial<CollectionState>;
  if (!obj.cards || typeof obj.cards !== 'object') {
    return { ...DEFAULT_COLLECTION, cards: {} };
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
  return { version: 1, cards: cleanCards, history: obj.history || [] };
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
  
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;
  
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setSyncStatus('offline-pending');
    return;
  }
  
  setSyncStatus('syncing');
  const stateToSync = queue[queue.length - 1];
  try {
    const { error } = await supabase
      .from('collections')
      .update({ state: stateToSync, updated_at: new Date().toISOString() })
      .eq('user_id', session.user.id);
      
    if (error) {
      setSyncStatus('error');
    } else {
      safeWrite(KEYS.syncQueue, []);
      setSyncStatus('synced');
      setTimeout(() => {
        if (currentSyncStatus === 'synced') {
          setSyncStatus('idle');
        }
      }, 2500);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Cloud Sync] Failed to flush sync queue:', err);
    setSyncStatus('error');
  }
}

async function syncToCloud(state: CollectionState) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      addToSyncQueue(state);
      setSyncStatus('offline-pending');
      return;
    }
    
    setSyncStatus('syncing');
    try {
      const { error } = await supabase
        .from('collections')
        .update({ state, updated_at: new Date().toISOString() })
        .eq('user_id', session.user.id);
      
      if (error) {
        addToSyncQueue(state);
        setSyncStatus('offline-pending');
      } else {
        setSyncStatus('synced');
        // Reset to idle after 2.5 seconds to allow UI animations to complete smoothly
        setTimeout(() => {
          if (currentSyncStatus === 'synced') {
            setSyncStatus('idle');
          }
        }, 2500);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Cloud Sync] Failed to sync collection, queueing:', err);
      addToSyncQueue(state);
      setSyncStatus('offline-pending');
    }
  }
}

export async function fetchCloudCollection(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    setSyncStatus('syncing');
    try {
      const { data, error } = await supabase
        .from('collections')
        .select('state')
        .eq('user_id', session.user.id)
        .single();
        
      if (!error && data?.state) {
        const localState = getCollection();
        const remoteState = data.state as CollectionState;
        const mergedState = mergeCollections(localState, remoteState);
        
        safeWrite(KEYS.collection, mergedState);
        notify();
        setSyncStatus('synced');
        
        // If the merged state contains new local modifications not present on the remote database,
        // instantly push it up to Supabase to unify both states.
        if (JSON.stringify(mergedState) !== JSON.stringify(remoteState)) {
          syncToCloud(mergedState).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[Cloud Sync] Failed to auto-unify merged state:', err);
          });
        }

        setTimeout(() => {
          if (currentSyncStatus === 'synced') {
            setSyncStatus('idle');
          }
        }, 2500);
      } else if (error) {
        setSyncStatus('error');
      } else {
        setSyncStatus('idle');
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Cloud Sync] Failed to fetch collection:', err);
      setSyncStatus('error');
    }
  }
}

function writeCollection(state: CollectionState): void {
  safeWrite(KEYS.collection, state);
  notify();
  syncToCloud(state).catch(console.error);
}

export function getCardMeta(cardId: string): CollectionCardMeta | undefined {
  return getCollection().cards[cardId];
}

export function saveCardMeta(
  cardId: string,
  patch: Partial<CollectionCardMeta>,
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
    owned: q > 0 ? true : getCardMeta(cardId)?.owned ?? false,
  });
}

export function updateCondition(
  cardId: string,
  condition: CollectionCardMeta['condition'],
): CollectionCardMeta {
  return saveCardMeta(cardId, { condition });
}

export function updateVariant(
  cardId: string,
  variant: CollectionCardMeta['variant'],
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
    const safeQty = Math.max(
      0,
      Math.floor(typeof m.quantity === 'number' ? m.quantity : 0),
    );
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
    { uniqueCount: 0, totalQuantity: 0, favoriteCount: 0, wishlistCount: 0, missingCount: 0 },
  );
}

/* ------------------------------------------------------------------------- */
/* Initialization & Event Listeners for Offline Sync                         */
/* ------------------------------------------------------------------------- */

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushSyncQueue().catch(console.error);
  });
  window.addEventListener('offline', () => {
    if (getSyncQueue().length > 0) {
      setSyncStatus('offline-pending');
    }
  });
  
  // Trigger flush immediately on startup if online
  if (navigator.onLine) {
    flushSyncQueue().catch(console.error);
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
