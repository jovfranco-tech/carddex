import type {
  ApiListResponse,
  ApiSingleResponse,
  CardSet,
  PokemonCard,
  SearchCardsParams,
} from '@/types/pokemon';
import {
  saveCardToDb,
  getCardFromDb,
  getAllCardsFromDb,
  pruneCardsDb,
  clearCardsDb,
} from './indexedDb';
import { OFFLINE_CARD_CATALOG } from './offlineCardCatalog';


const BASE_URL = (
  import.meta.env.VITE_POKEMON_TCG_API_BASE_URL as string | undefined
)?.trim() || 'https://api.pokemontcg.io/v2';

const API_KEY = (
  import.meta.env.VITE_POKEMON_TCG_API_KEY as string | undefined
)?.trim();

export class TcgApiError extends Error {
  status: number;
  /** True when the request was aborted by the caller (not a real error). */
  aborted: boolean;
  constructor(message: string, status: number, aborted = false) {
    super(message);
    this.name = 'TcgApiError';
    this.status = status;
    this.aborted = aborted;
  }
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof TcgApiError) return err.aborted;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (
    err &&
    typeof err === 'object' &&
    'name' in err &&
    (err as { name: string }).name === 'AbortError'
  ) {
    return true;
  }
  return false;
}

/**
 * Whether an API key is configured. UI surfaces this in the profile screen.
 * The API permits unauthenticated requests but with a tight rate limit.
 */
export function hasApiKey(): boolean {
  return Boolean(API_KEY);
}

/* ------------------------------------------------------------------------- */
/* Persistent Card Cache with LRU Eviction (localStorage)                     */
/* ------------------------------------------------------------------------- */

interface CacheEntry {
  card: PokemonCard;
  timestamp: number;
}

function loadPersistedCardCache(cacheMap: Map<string, PokemonCard>): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('carddex.card_cache.v1');
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
      Object.entries(parsed).forEach(([id, entry]) => {
        if (entry && entry.card) {
          // Set in superclass directly to avoid trigger loop/persisting on load
          Map.prototype.set.call(cacheMap, id, entry.card);
        }
      });
      // eslint-disable-next-line no-console
      console.log(`[API Cache] Hydrated ${cacheMap.size} cards from localStorage.`);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[API Cache] Failed to load persisted card cache:', e);
  }
}

function persistCardCache(cacheMap: Map<string, PokemonCard>): void {
  if (typeof window === 'undefined') return;
  try {
    const entries: Record<string, CacheEntry> = {};
    const raw = localStorage.getItem('carddex.card_cache.v1');
    if (raw) {
      Object.assign(entries, JSON.parse(raw));
    }

    cacheMap.forEach((card, id) => {
      entries[id] = {
        card,
        timestamp: entries[id]?.timestamp ?? Date.now(),
      };
    });

    const keys = Object.keys(entries);
    if (keys.length > 150) {
      const sorted = keys
        .map((k) => ({ id: k, timestamp: entries[k].timestamp }))
        .sort((a, b) => b.timestamp - a.timestamp); // newest first
      
      const toKeep = sorted.slice(0, 150);
      const pruned: Record<string, CacheEntry> = {};
      toKeep.forEach((item) => {
        pruned[item.id] = entries[item.id];
      });
      localStorage.setItem('carddex.card_cache.v1', JSON.stringify(pruned));
    } else {
      localStorage.setItem('carddex.card_cache.v1', JSON.stringify(entries));
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[API Cache] Failed to persist card cache:', e);
  }
}

function updateAccessTimestamp(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('carddex.card_cache.v1');
    if (!raw) return;
    const entries = JSON.parse(raw) as Record<string, CacheEntry>;
    if (entries[id]) {
      entries[id].timestamp = Date.now();
      localStorage.setItem('carddex.card_cache.v1', JSON.stringify(entries));
    }
  } catch (e) {
    // Silent ignore
  }
}

async function initPersistedCardCache(cacheMap: Map<string, PokemonCard>): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const dbEntries = await getAllCardsFromDb();
    dbEntries.forEach((entry) => {
      if (entry && entry.card) {
        Map.prototype.set.call(cacheMap, entry.id, entry.card);
      }
    });
    // eslint-disable-next-line no-console
    console.log(`[API Cache] Hydrated ${cacheMap.size} cards from IndexedDB.`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[API Cache] Failed to load IndexedDB card cache:', e);
  }
}

class PersistedCardCache extends Map<string, PokemonCard> {
  constructor() {
    super();
    loadPersistedCardCache(this);
    initPersistedCardCache(this);
  }

  set(key: string, value: PokemonCard): this {
    super.set(key, value);
    setTimeout(() => {
      persistCardCache(this);
      saveCardToDb(value).then(() => pruneCardsDb(1000));
    }, 0);
    return this;
  }

  get(key: string): PokemonCard | undefined {
    const card = super.get(key);
    if (card) {
      setTimeout(() => updateAccessTimestamp(key), 0);
    }
    return card;
  }

  clear(): void {
    super.clear();
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('carddex.card_cache.v1');
        clearCardsDb();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[API Cache] Failed to clear local caches:', e);
      }
    }
  }
}

const cardCache = new PersistedCardCache();
const searchCache = new Map<string, { value: ApiListResponse<PokemonCard>; expiresAt: number }>();
const setsCache: { value: CardSet[] | null; expiresAt: number } = {
  value: null,
  expiresAt: 0,
};

/** Drop cached cards (used by tests and the "clear data" flow). */
export function clearApiCache(): void {
  cardCache.clear();
  searchCache.clear();
  setsCache.value = null;
  setsCache.expiresAt = 0;
}

export function getCachedCard(id: string): PokemonCard | undefined {
  return cardCache.get(id);
}

/* ------------------------------------------------------------------------- */
/* Low-level fetch                                                            */
/* ------------------------------------------------------------------------- */

interface RequestOptions {
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (API_KEY) headers['X-Api-Key'] = API_KEY;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { headers, signal: opts.signal });
  } catch (err) {
    if (isAbortError(err)) {
      throw new TcgApiError('Petición cancelada.', 0, true);
    }
    throw new TcgApiError(
      err instanceof Error
        ? `Error de red: ${err.message}`
        : 'Error de red desconocido.',
      0,
    );
  }

  if (res.status === 429) {
    throw new TcgApiError(
      'Has alcanzado el límite de peticiones del API. Inténtalo en unos segundos.',
      429,
    );
  }
  if (res.status === 404) {
    throw new TcgApiError('No se encontró el recurso solicitado.', 404);
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body?.error?.message ?? '';
    } catch {
      /* ignore JSON parse errors on error responses */
    }
    throw new TcgApiError(
      detail || `Error ${res.status} del servidor.`,
      res.status,
    );
  }

  return (await res.json()) as T;
}

/* ------------------------------------------------------------------------- */
/* Query helpers                                                              */
/* ------------------------------------------------------------------------- */

function buildQueryString(
  params: Record<string, string | number | undefined>,
): string {
  const parts: string[] = [];
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === '') return;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

const SPANISH_TO_ENGLISH_MAP: Record<string, string> = {
  "cambio": "Switch",
  "investigacion de profesores": "Professor's Research",
  "busqueda de profesores": "Professor's Research",
  "orden de jefes": "Boss's Orders",
  "ordenes de jefes": "Boss's Orders",
  "nido ball": "Nest Ball",
  "ente ball": "Beast Ball",
  "veloz ball": "Quick Ball",
  "turno ball": "Repeat Ball",
  "amigo ball": "Friend Ball",
  "lujo ball": "Luxury Ball",
  "peso ball": "Heavy Ball",
  "nivel ball": "Level Ball",
  "hiper ball": "Ultra Ball",
  "super ball": "Great Ball",
  "captura ball": "Nest Ball",
  "recuperacion de energia": "Energy Retrieval",
  "busqueda de energia": "Energy Search",
  "transferencia de energia": "Energy Switch",
  "caramelo raro": "Rare Candy",
  "pocion": "Potion",
  "superpocion": "Super Potion",
  "cuerda huida": "Escape Rope",
  "incienso evolucion": "Evolution Incense",
  "globo de helio": "Air Balloon",
  "martillo demoledor": "Crushing Hammer",
  "martillo mejorado": "Enhanced Hammer",
  "plato de metales": "Metal Saucer",
  "parche aqua": "Aqua Patch",
  "parche oscuro": "Dark Patch",
  "cana de pescar ordinaria": "Ordinary Rod",
  "soplador de campo": "Field Blower",
  "guzma": "Guzma",
  "cinturon eleccion": "Choice Belt",
  "cinta vitalidad": "Vitality Band",
  "amuleto de dureza": "Cape of Toughness",
  "compartir experiencia": "Exp. Share",
  "casco resonante": "Resonant Helmet",
  "piedra flotante": "Float Stone",
  "botas de caminata": "Trekking Shoes",
  "zapatos de trekking": "Trekking Shoes",
  "pase de combate vip": "VIP Battle Pass",
  "pase vip de batalla": "VIP Battle Pass",
  "generador electrico": "Electric Generator",
  "vasija terrestre": "Earthquake Vessel",
  "vasija antigua": "Earthen Vessel",
  "sello de alerta": "Alert Stamp",
  "sello de disruption": "Unfair Stamp",
  "sello injusto": "Unfair Stamp",
  "pokegear": "Pokégear",
  "pokeball": "Poké Ball",
  "pokebola": "Poké Ball",
  "energia planta": "Grass Energy",
  "energia fuego": "Fire Energy",
  "energia agua": "Water Energy",
  "energia rayo": "Lightning Energy",
  "energia psiquica": "Psychic Energy",
  "energia lucha": "Fighting Energy",
  "energia oscura": "Darkness Energy",
  "energia metal": "Metal Energy",
  "energia dragon": "Dragon Energy",
  "energia hada": "Fairy Energy",
  "energia incolora": "Colorless Energy",
  "energia": "Energy",
  "pikachu gordo": "Pikachu VMAX",
  "pikachu choncho": "Pikachu VMAX",
  "pikachu obeso": "Pikachu VMAX",
  "chonkachu": "Pikachu VMAX",
  "charizard gordo": "Charizard VMAX",
  "gordo": "VMAX",
  "gorda": "VMAX"
};

export function translateSpanishQuery(query: string): string {
  const normalized = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  // 1. First check if the entire normalized query matches a dictionary key exactly.
  if (SPANISH_TO_ENGLISH_MAP[normalized]) {
    return SPANISH_TO_ENGLISH_MAP[normalized];
  }

  // 2. Otherwise, check if we can replace key Spanish phrases within the query.
  // We sort map keys by length descending to replace longer phrases first (e.g. "energia fuego" before "energia").
  let translated = normalized;
  const sortedKeys = Object.keys(SPANISH_TO_ENGLISH_MAP).sort((a, b) => b.length - a.length);
  
  let replacedAny = false;
  for (const key of sortedKeys) {
    if (translated.includes(key)) {
      translated = translated.replace(new RegExp(key, 'g'), SPANISH_TO_ENGLISH_MAP[key]);
      replacedAny = true;
    }
  }

  return replacedAny ? translated : query;
}

export interface ParsedQuery {
  name: string;
  number?: string;
  setId?: string;
}

export function parseSearchQuery(query: string): ParsedQuery {
  const translated = translateSpanishQuery(query);
  const words = translated.split(/\s+/).filter(Boolean);
  
  let numberVal: string | undefined = undefined;
  let setIdVal: string | undefined = undefined;
  const nameWords: string[] = [];

  for (const word of words) {
    const cleanWord = word.replace(/["\\]/g, '').trim();
    if (!cleanWord) continue;

    // Detect card number fraction (e.g., "026/071", "120/165")
    if (cleanWord.includes('/')) {
      const parts = cleanWord.split('/');
      if (parts[0] && /^\d+$/.test(parts[0])) {
        numberVal = parts[0];
        continue;
      }
    }

    // Detect pure digit card number (e.g., "120", "2")
    if (/^\d+$/.test(cleanWord)) {
      numberVal = cleanWord;
      continue;
    }

    // Detect TG/GG gallery numbers or special numbering formats (e.g. "TG12", "GG05", "RC01")
    if (/^(tg|gg|rc)\d+$/i.test(cleanWord)) {
      numberVal = cleanWord;
      continue;
    }

    // Detect set ID codes (e.g., "sv3", "swsh12", "xy1", "base4", "me1", "zsv10pt5")
    if (/^(sv|swsh|sm|xy|bw|col|hgss|pl|dp|ex|np|pop|me|zsv|rsv|base|cel|det|dv|ecard|fut|gym|mcd|neo|ru|si|tk)\d+[a-z0-9]*$/i.test(cleanWord)) {
      setIdVal = cleanWord.toLowerCase();
      continue;
    }

    nameWords.push(cleanWord);
  }

  return {
    name: nameWords.join(' '),
    number: numberVal,
    setId: setIdVal,
  };
}

/**
 * Compose a Pokémon TCG API `q` query from structured filters.
 * Example output:  name:*char* AND name:*ex* rarity:"Rare Holo" set.id:swsh1
 */
function composeQuery(opts: SearchCardsParams): string | undefined {
  const fragments: string[] = [];
  const raw = opts.q?.trim();
  if (raw) fragments.push(raw);
  
  if (opts.name) {
    const parsed = parseSearchQuery(opts.name);
    
    if (parsed.name) {
      const words = parsed.name.split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        const queryTerms = words.map((w) => `name:*${w}*`);
        fragments.push(queryTerms.join(' AND '));
      }
    }
    
    if (parsed.number) {
      const cleanNum = parsed.number.replace(/^[0]+/, '').trim();
      if (cleanNum) {
        fragments.push(`number:"${cleanNum}"`);
      }
    }
    
    if (parsed.setId) {
      fragments.push(`set.id:${parsed.setId}`);
    }
  }
  
  if (opts.setId) fragments.push(`set.id:${opts.setId}`);
  if (opts.rarity) fragments.push(`rarity:"${opts.rarity}"`);
  if (opts.type) fragments.push(`types:${opts.type}`);
  return fragments.length ? fragments.join(' ') : undefined;
}

/* ------------------------------------------------------------------------- */
/* Public API                                                                 */
/* ------------------------------------------------------------------------- */

/**
 * Searches the offline catalog and user custom cards for cards matching the name query.
 * Returns matching PokemonCard objects (normalized from CustomCard format).
 */
function searchLocalCards(nameQuery: string): PokemonCard[] {
  const trimmedQuery = (nameQuery || '').trim();

  // Load custom cards first since we will need them in both empty and non-empty queries
  const customCards: PokemonCard[] = [];
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('carddex.customCards');
      if (raw) {
        const parsed = JSON.parse(raw) as Array<{
          id: string;
          name: string;
          type: string;
          hp: string;
          stage: string;
          imageUrl: string;
          attack1?: { name: string; cost: string[]; damage: string; effect: string };
          attack2?: { name: string; cost: string[]; damage: string; effect: string };
          weakness?: string;
          createdAt?: string;
        }>;
        for (const cc of parsed) {
          customCards.push({
            id: cc.id,
            name: cc.name,
            supertype: 'Pokémon',
            subtypes: [cc.stage || 'Basic', 'Custom'],
            hp: cc.hp,
            types: [cc.type],
            attacks: [
              ...(cc.attack1 ? [{
                name: cc.attack1.name,
                cost: cc.attack1.cost,
                convertedEnergyCost: cc.attack1.cost.length,
                damage: cc.attack1.damage,
                text: cc.attack1.effect,
              }] : []),
              ...(cc.attack2 ? [{
                name: cc.attack2.name,
                cost: cc.attack2.cost,
                convertedEnergyCost: cc.attack2.cost.length,
                damage: cc.attack2.damage,
                text: cc.attack2.effect,
              }] : []),
            ],
            weaknesses: cc.weakness ? [{ type: cc.weakness, value: '×2' }] : undefined,
            set: { id: 'custom', name: 'Carta Custom', series: 'Custom', printedTotal: 0, total: 0 },
            number: cc.id.replace('custom-', ''),
            rarity: 'Custom',
            images: { small: cc.imageUrl, large: cc.imageUrl },
          });
        }
      }
    } catch {
      // ignore localStorage errors
    }
  }

  // If query is empty, return all local catalog + all custom cards
  if (trimmedQuery === '') {
    return [...OFFLINE_CARD_CATALOG, ...customCards];
  }

  if (trimmedQuery.length < 2) return [];

  // Extract meaningful words from query (strip API Lucene syntax like name:*x*)
  const rawQuery = nameQuery
    .replace(/name:\*?([^*\s]+)\*?/gi, '$1') // strip name:*word* -> word
    .replace(/["*]/g, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const words = rawQuery.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return [];

  const matched: PokemonCard[] = [];
  const seenIds = new Set<string>();

  // 1. Search offline catalog — a card matches if ANY search word appears in its name
  for (const card of OFFLINE_CARD_CATALOG) {
    const cardName = (card.name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const anyWordMatches = words.some((w) => cardName.includes(w));
    if (anyWordMatches && !seenIds.has(card.id)) {
      seenIds.add(card.id);
      matched.push(card);
    }
  }

  // 2. Search custom cards
  for (const card of customCards) {
    const cardName = (card.name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const anyWordMatches = words.some((w) => cardName.includes(w));
    if (anyWordMatches && !seenIds.has(card.id)) {
      seenIds.add(card.id);
      matched.push(card);
    }
  }

  return matched;
}

export async function searchCards(
  params: SearchCardsParams = {},
  opts: RequestOptions = {},
): Promise<ApiListResponse<PokemonCard>> {
  // Derive the local name query from params.name, or from params.q as fallback
  const localNameQuery = params.name ?? params.q ?? '';

  // When localOnly is requested, skip the API entirely and return only local results.
  if (params.localOnly) {
    const localMatches = searchLocalCards(localNameQuery);
    return {
      data: localMatches,
      page: 1,
      pageSize: localMatches.length,
      count: localMatches.length,
      totalCount: localMatches.length,
    };
  }

  const q = composeQuery(params);
  const qs = buildQueryString({
    q,
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 24,
    orderBy: params.orderBy,
  });

  const cacheKey = qs;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  let apiResponse: ApiListResponse<PokemonCard>;
  try {
    apiResponse = await request<ApiListResponse<PokemonCard>>(`/cards${qs}`, opts);
    // Warm the per-card cache so subsequent getCardById calls are free.
    apiResponse.data.forEach((c) => cardCache.set(c.id, c));
    searchCache.set(cacheKey, { value: apiResponse, expiresAt: Date.now() + 5 * 60 * 1000 });
  } catch (err) {
    // If offline or API error, return only local results
    const localMatches = searchLocalCards(localNameQuery);
    if (localMatches.length > 0) {
      return { data: localMatches, page: 1, pageSize: localMatches.length, count: localMatches.length, totalCount: localMatches.length };
    }
    throw err;
  }

  // Merge local matches that aren't already in the API results
  if (localNameQuery) {
    const localMatches = searchLocalCards(localNameQuery);
    const apiIds = new Set(apiResponse.data.map((c) => c.id));
    const uniqueLocal = localMatches.filter((c) => !apiIds.has(c.id));
    if (uniqueLocal.length > 0) {
      const merged: ApiListResponse<PokemonCard> = {
        ...apiResponse,
        data: [...uniqueLocal, ...apiResponse.data],
        count: apiResponse.count + uniqueLocal.length,
        totalCount: apiResponse.totalCount + uniqueLocal.length,
      };
      return merged;
    }
  }

  return apiResponse;
}

/**
 * Recupera una carta localmente (ya sea del catálogo offline o de las customCards guardadas).
 */
export function getLocalCardById(id: string): PokemonCard | undefined {
  // 1. Buscar en el catálogo offline
  const offlineMatch = OFFLINE_CARD_CATALOG.find((c) => c.id === id);
  if (offlineMatch) return offlineMatch;

  // 2. Buscar en las cartas personalizadas guardadas (customCards)
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('carddex.customCards');
      if (raw) {
        const parsed = JSON.parse(raw) as Array<{
          id: string;
          name: string;
          type: string;
          hp: string;
          stage: string;
          imageUrl: string;
          attack1?: { name: string; cost: string[]; damage: string; effect: string };
          attack2?: { name: string; cost: string[]; damage: string; effect: string };
          weakness?: string;
          createdAt?: string;
        }>;
        const cc = parsed.find((card) => card.id === id);
        if (cc) {
          return {
            id: cc.id,
            name: cc.name,
            supertype: 'Pokémon',
            subtypes: [cc.stage || 'Basic', 'Custom'],
            hp: cc.hp,
            types: [cc.type],
            attacks: [
              ...(cc.attack1 ? [{
                name: cc.attack1.name,
                cost: cc.attack1.cost,
                convertedEnergyCost: cc.attack1.cost.length,
                damage: cc.attack1.damage,
                text: cc.attack1.effect,
              }] : []),
              ...(cc.attack2 ? [{
                name: cc.attack2.name,
                cost: cc.attack2.cost,
                convertedEnergyCost: cc.attack2.cost.length,
                damage: cc.attack2.damage,
                text: cc.attack2.effect,
              }] : []),
            ],
            weaknesses: cc.weakness ? [{ type: cc.weakness, value: '×2' }] : undefined,
            set: { id: 'custom', name: 'Carta Custom', series: 'Custom', printedTotal: 0, total: 0 },
            number: cc.id.replace('custom-', ''),
            rarity: 'Custom',
            images: { small: cc.imageUrl, large: cc.imageUrl },
          };
        }
      }
    } catch {
      // ignore
    }
  }
  return undefined;
}

export async function getCardById(
  id: string,
  opts: RequestOptions = {},
): Promise<PokemonCard> {
  const cached = cardCache.get(id);
  if (cached) return cached;

  // Interceptar si es una carta local (catálogo offline o custom)
  const localCard = getLocalCardById(id);
  if (localCard) {
    cardCache.set(id, localCard);
    return localCard;
  }

  // Try retrieving from IndexedDB cache first
  const dbCard = await getCardFromDb(id);
  if (dbCard) {
    // Populate the memory cache Map
    Map.prototype.set.call(cardCache, id, dbCard);
    return dbCard;
  }

  const { data } = await request<ApiSingleResponse<PokemonCard>>(
    `/cards/${encodeURIComponent(id)}`,
    opts,
  );
  cardCache.set(id, data);
  return data;
}

/**
 * Fetch many cards by id, in parallel, deduped via the in-memory cache.
 * Failures are dropped (we'd rather show 9/10 cards than nothing).
 */
export async function getCardsByIds(
  ids: string[],
  opts: RequestOptions = {},
): Promise<PokemonCard[]> {
  if (ids.length === 0) return [];
  const unique = Array.from(new Set(ids));

  // 1. Separate cached and local from uncached IDs to avoid redundant fetch calls
  const results: PokemonCard[] = [];
  const uncachedIds: string[] = [];

  for (const id of unique) {
    const cached = cardCache.get(id);
    if (cached) {
      results.push(cached);
    } else {
      const localCard = getLocalCardById(id);
      if (localCard) {
        cardCache.set(id, localCard);
        results.push(localCard);
      } else {
        uncachedIds.push(id);
      }
    }
  }

  if (uncachedIds.length === 0) {
    // Everything was cached or local; return them in the original requested unique order
    return unique.map((id) => cardCache.get(id)!).filter(Boolean);
  }

  // 2. Group uncached IDs into batches of 25 to fit inside URL limits safely
  const BATCH_SIZE = 25;
  const batches: string[][] = [];
  for (let i = 0; i < uncachedIds.length; i += BATCH_SIZE) {
    batches.push(uncachedIds.slice(i, i + BATCH_SIZE));
  }

  const fetchPromises = batches.map(async (batch) => {
    // Build standard Lucene OR search query: id:"xy1-1" OR id:"xy1-2" OR ...
    const q = batch.map((id) => `id:"${id}"`).join(' OR ');
    try {
      const response = await searchCards({ q, pageSize: BATCH_SIZE }, opts);
      return response.data;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[API Batching] Failed to fetch batch of cards:`, err);
      return [];
    }
  });

  const fetchedGroups = await Promise.all(fetchPromises);
  for (const group of fetchedGroups) {
    for (const card of group) {
      cardCache.set(card.id, card);
    }
  }

  // Return all unique requested cards in the original order
  return unique.map((id) => cardCache.get(id)!).filter(Boolean);
}

export async function getSets(opts: RequestOptions = {}): Promise<CardSet[]> {
  // Cache for 5 minutes — sets rarely change.
  if (setsCache.value && Date.now() < setsCache.expiresAt) {
    return setsCache.value;
  }
  const { data } = await request<ApiListResponse<CardSet>>(
    `/sets${buildQueryString({ orderBy: '-releaseDate', pageSize: 250 })}`,
    opts,
  );
  setsCache.value = data;
  setsCache.expiresAt = Date.now() + 5 * 60 * 1000;
  return data;
}

export async function getSetById(
  id: string,
  opts: RequestOptions = {},
): Promise<CardSet> {
  const cached = setsCache.value?.find((s) => s.id === id);
  if (cached) return cached;
  const { data } = await request<ApiSingleResponse<CardSet>>(
    `/sets/${encodeURIComponent(id)}`,
    opts,
  );
  return data;
}

export async function getCardsBySet(
  setId: string,
  page = 1,
  pageSize = 60,
  opts: RequestOptions = {},
): Promise<ApiListResponse<PokemonCard>> {
  return searchCards(
    { setId, page, pageSize, orderBy: 'number' },
    opts,
  );
}

/** Cards with the same Pokémon name across sets. Useful for "Aparece en". */
export async function getSimilarCardsByName(
  name: string,
  limit = 6,
  opts: RequestOptions = {},
): Promise<PokemonCard[]> {
  if (!name.trim()) return [];
  const safe = name.split(/\s+/)[0]; // First token; suffixes like "VMAX" hurt recall.
  const { data } = await searchCards(
    { name: safe, pageSize: limit, orderBy: '-set.releaseDate' },
    opts,
  );
  return data;
}
