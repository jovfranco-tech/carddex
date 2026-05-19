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

const KEYS = {
  collection: 'carddex.collection.v1',
  recent: 'carddex.recentlyViewed.v1',
  settings: 'carddex.settings.v1',
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
  return { version: 1, cards: cleanCards };
}

async function syncToCloud(state: CollectionState) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    await supabase
      .from('collections')
      .update({ state, updated_at: new Date().toISOString() })
      .eq('user_id', session.user.id);
  }
}

export async function fetchCloudCollection(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const { data, error } = await supabase
      .from('collections')
      .select('state')
      .eq('user_id', session.user.id)
      .single();
      
    if (!error && data?.state) {
      safeWrite(KEYS.collection, data.state);
      notify();
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
