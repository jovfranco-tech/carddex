import type {
  ApiListResponse,
  ApiSingleResponse,
  CardSet,
  PokemonCard,
  SearchCardsParams,
} from '@/types/pokemon';

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
/* In-memory session cache                                                   */
/* ------------------------------------------------------------------------- */
/*
 * The cache lives for the lifetime of the page. It is intentionally not
 * persisted to LocalStorage: we want fresh prices on reload and to keep our
 * persisted footprint small (only user-owned collection metadata).
 */

const cardCache = new Map<string, PokemonCard>();
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

/**
 * Compose a Pokémon TCG API `q` query from structured filters.
 * Example output:  name:"char*" rarity:"Rare Holo" set.id:swsh1
 */
function composeQuery(opts: SearchCardsParams): string | undefined {
  const fragments: string[] = [];
  const raw = opts.q?.trim();
  if (raw) fragments.push(raw);
  if (opts.name) {
    // Strip characters that would break the q-syntax. Names can include
    // apostrophes ("Farfetch'd") and accents — keep them but quote-escape.
    const safe = opts.name.replace(/["\\]/g, '').trim();
    if (safe) fragments.push(`name:"${safe}*"`);
  }
  if (opts.setId) fragments.push(`set.id:${opts.setId}`);
  if (opts.rarity) fragments.push(`rarity:"${opts.rarity}"`);
  if (opts.type) fragments.push(`types:${opts.type}`);
  return fragments.length ? fragments.join(' ') : undefined;
}

/* ------------------------------------------------------------------------- */
/* Public API                                                                 */
/* ------------------------------------------------------------------------- */

export async function searchCards(
  params: SearchCardsParams = {},
  opts: RequestOptions = {},
): Promise<ApiListResponse<PokemonCard>> {
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

  const response = await request<ApiListResponse<PokemonCard>>(`/cards${qs}`, opts);
  // Warm the per-card cache so subsequent getCardById calls are free.
  response.data.forEach((c) => cardCache.set(c.id, c));
  
  searchCache.set(cacheKey, { value: response, expiresAt: Date.now() + 5 * 60 * 1000 });
  return response;
}

export async function getCardById(
  id: string,
  opts: RequestOptions = {},
): Promise<PokemonCard> {
  const cached = cardCache.get(id);
  if (cached) return cached;
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
  const results = await Promise.allSettled(
    unique.map((id) => getCardById(id, opts)),
  );
  return results
    .filter(
      (r): r is PromiseFulfilledResult<PokemonCard> => r.status === 'fulfilled',
    )
    .map((r) => r.value);
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
