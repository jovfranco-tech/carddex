/**
 * Card recognition — architecture module for the camera-based scanner.
 *
 * v1 STATUS: assisted / simulated. There is no real OCR or image-matching
 * pipeline. When the user captures a frame or uploads a photo we currently
 * cycle through a small set of popular Pokémon names and enrich each pick
 * with real data from the Pokémon TCG API.
 *
 * The shape of `RecognitionResult` is the contract we want for v2: it captures
 * what a full OCR + image-matching pipeline would surface (card name, number,
 * inferred category, type, set guess, confidence, detected language). When v2
 * lands, only the implementation of `recognizeCardFromImage` needs to change
 * — every consumer keeps working.
 *
 * TODO (v2):
 *   1. OCR card name from the top text band.
 *   2. OCR card number / set total from the bottom-left band.
 *   3. Image hashing (pHash / dHash) against a precomputed catalog for the
 *      fallback path when OCR confidence is low.
 *   4. Pokémon TCG API enrichment by (setId, number) instead of name only.
 *   5. Low-confidence correction flow with the existing CorrectionSheet.
 *   6. Multi-language recognition: ES / JP / IT / DE / FR. Detected language
 *      should also drive `language` on `CollectionCardMeta` when saving.
 *   7. Frame-quality heuristics — reject blurry/glare frames before OCR.
 */

import { searchCards, getSets } from './pokemonTcgApi';
import type { PokemonCard } from '@/types/pokemon';

/** What category the recognized card belongs to. */
export type CardCategory = 'Pokémon' | 'Trainer' | 'Energy' | 'Unknown';

/** Known Pokémon TCG elemental types (best-effort). */
export type PokemonType =
  | 'Colorless'
  | 'Darkness'
  | 'Dragon'
  | 'Fairy'
  | 'Fighting'
  | 'Fire'
  | 'Grass'
  | 'Lightning'
  | 'Metal'
  | 'Psychic'
  | 'Water';

/** Result returned by every recognition implementation. */
export interface RecognitionResult {
  /** Canonical card from the Pokémon TCG API when matched, else null. */
  card: PokemonCard | null;

  /** Recognized name (may differ slightly from canonical card.name). */
  cardName: string;

  /** High-level category. */
  cardCategory: CardCategory;

  /** Pokémon elemental types (only meaningful when cardCategory === 'Pokémon'). */
  pokemonTypes: string[];

  /** Best-guess set id from the API (e.g. "swsh1"). */
  possibleSet: string | null;
  /** Set name for display when possibleSet is set. */
  possibleSetName: string | null;

  /** Printed card number, e.g. "12/202". `null` when not detected. */
  number: string | null;

  /** Overall confidence in [0, 1]. */
  confidence: number;

  /** True iff confidence is high enough to auto-advance the UI. */
  highConfidence: boolean;

  /** Free-form notes for the UI ("ocr_failed", "fallback_demo", …). */
  source: 'mock' | 'api_lookup' | 'manual' | 'failed';

  /** True when the result was produced from the simulated demo cycle. */
  simulated: boolean;

  /**
   * Detected card language code (ISO 639-1 or short label, e.g. "EN", "ES",
   * "JP"). Currently always null in MVP — real OCR will populate it in v2.
   */
  detectedLanguage: string | null;
}

/** Input the recognizer accepts. For now we accept files, frames, or seeds. */
export type RecognitionInput =
  | { type: 'file'; file: File }
  | { type: 'frame'; bitmap: ImageBitmap }
  | { type: 'seed'; name: string }
  | { type: 'none' };

export interface RecognizeOptions {
  signal?: AbortSignal;
}

/** Names cycled through for demo captures so successive taps feel varied. */
const DEMO_NAMES: ReadonlyArray<string> = [
  'Charizard',
  'Pikachu',
  'Mewtwo',
  'Gengar',
  'Eevee',
  'Snorlax',
  'Lucario',
  'Greninja',
];

/** Confidence band used for "highConfidence" gating. */
export const HIGH_CONFIDENCE_THRESHOLD = 0.7;

let demoIndex = 0;
const seedCache = new Map<string, PokemonCard>();

/** Pick the next demo seed name in a stable rotation. */
function nextDemoName(): string {
  const name = DEMO_NAMES[demoIndex % DEMO_NAMES.length];
  demoIndex += 1;
  return name;
}

/* ------------------------------------------------------------------------- */
/* Pure helpers — tested in isolation                                         */
/* ------------------------------------------------------------------------- */

/**
 * Classify a card into a high-level category from its supertype.
 * Pure, synchronous, easy to test.
 */
export function classifyCardCategory(card?: PokemonCard | null): CardCategory {
  const s = card?.supertype?.toLowerCase();
  if (!s) return 'Unknown';
  if (s.includes('pokémon') || s.includes('pokemon')) return 'Pokémon';
  if (s.includes('trainer')) return 'Trainer';
  if (s.includes('energy')) return 'Energy';
  return 'Unknown';
}

/**
 * Back-compat alias for `classifyCardCategory`. Kept so older imports (and
 * `cardAssistant.ts`) don't need to change.
 */
export const classifyCategory = classifyCardCategory;

/**
 * Return the Pokémon elemental types for a card, but only when the card is a
 * Pokémon. Trainer/Energy cards return an empty array — even if the API
 * spuriously returns `types` for them.
 */
export function classifyPokemonTypes(card?: PokemonCard | null): string[] {
  if (!card) return [];
  if (classifyCardCategory(card) !== 'Pokémon') return [];
  if (!Array.isArray(card.types)) return [];
  return card.types.filter((t) => typeof t === 'string' && t.length > 0);
}

/**
 * Compute a confidence score for a RecognitionResult. Higher is better.
 * Pure function: only looks at what's already in the result, no I/O.
 */
export function getRecognitionConfidence(
  result: Pick<
    RecognitionResult,
    'card' | 'cardName' | 'cardCategory' | 'number' | 'possibleSet'
  >,
): number {
  if (!result.card) return 0;
  let score = 0.5; // base score for having any API match at all
  if (result.cardName && result.cardName.length > 0) score += 0.15;
  if (result.cardCategory !== 'Unknown') score += 0.15;
  if (result.number) score += 0.07;
  if (result.possibleSet) score += 0.05;
  return Math.min(1, Math.round(score * 100) / 100);
}

/**
 * Build a RecognitionResult from a canonical Pokémon TCG API card. Used by
 * `recognizeCardFromImage` after it picks a match, and exported so callers
 * (e.g. the CorrectionSheet) can convert a manual pick into the same shape.
 *
 * `confidence` is computed unless explicitly overridden — that way a manual
 * correction can claim 1.0 confidence even though the recognizer wouldn't.
 */
export function buildRecognitionResultFromApiCard(
  card: PokemonCard,
  options: {
    confidence?: number;
    source?: RecognitionResult['source'];
    simulated?: boolean;
    detectedLanguage?: string | null;
  } = {},
): RecognitionResult {
  const cardCategory = classifyCardCategory(card);
  const pokemonTypes = classifyPokemonTypes(card);
  const possibleSet = card.set?.id ?? null;
  const possibleSetName = card.set?.name ?? null;
  const number = card.number
    ? card.set?.printedTotal
      ? `${card.number}/${card.set.printedTotal}`
      : card.number
    : null;

  const base = {
    card,
    cardName: card.name,
    cardCategory,
    pokemonTypes,
    possibleSet,
    possibleSetName,
    number,
  };

  const confidence =
    options.confidence ?? getRecognitionConfidence({ ...base });
  return {
    ...base,
    confidence,
    highConfidence: confidence >= HIGH_CONFIDENCE_THRESHOLD,
    source: options.source ?? 'api_lookup',
    simulated: options.simulated ?? true,
    detectedLanguage: options.detectedLanguage ?? null,
  };
}

/** Fallback result when we have nothing matchable. */
function buildEmptyResult(reason: 'low_confidence' | 'network' | 'no_match'): RecognitionResult {
  return {
    card: null,
    cardName: '',
    cardCategory: 'Unknown',
    pokemonTypes: [],
    possibleSet: null,
    possibleSetName: null,
    number: null,
    confidence: reason === 'low_confidence' ? 0.42 : 0,
    highConfidence: false,
    source: 'failed',
    simulated: true,
    detectedLanguage: null,
  };
}

/* ------------------------------------------------------------------------- */
/* Public entry                                                               */
/* ------------------------------------------------------------------------- */

/**
 * 32-bit FNV-1a hash function to compute a short, stable signature for the Base64 image.
 */
export function hashString(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36);
}

interface OcrCacheEntry {
  hash: string;
  data: {
    cardName: string;
    number?: string;
    language?: string;
    englishNumber?: string;
    englishSetHint?: string;
  };
  timestamp: number;
}

function getOcrCache(): Record<string, OcrCacheEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('carddex.ocr_cache.v1');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Error reading OCR cache:', e);
    return {};
  }
}

function setOcrCache(cache: Record<string, OcrCacheEntry>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('carddex.ocr_cache.v1', JSON.stringify(cache));
  } catch (e) {
    console.error('Error writing OCR cache:', e);
  }
}

function saveToOcrCache(hash: string, data: any): void {
  const cache = getOcrCache();
  const keys = Object.keys(cache);
  
  if (keys.length >= 100) {
    const sorted = keys
      .map((k) => cache[k])
      .sort((a, b) => a.timestamp - b.timestamp);
    const evictCount = Math.max(1, keys.length - 99);
    for (let i = 0; i < evictCount; i++) {
      delete cache[sorted[i].hash];
    }
  }

  cache[hash] = {
    hash,
    data,
    timestamp: Date.now(),
  };
  setOcrCache(cache);
}

/**
 * Main entry point. Returns a believable RecognitionResult.
 *
 * MVP behaviour (no real CV):
 *   - For `seed` and `none` inputs, cycles through DEMO_NAMES and searches
 *     the real Pokémon TCG API for a popular card with that name.
 *   - For `file` and `frame` inputs we currently DO NOT analyze the pixel
 *     data — we just rotate the demo seed and flag the result as simulated.
 *     The TODO list at the top of this file is where the real OCR/pHash
 *     pipeline will land.
 */
export async function recognizeCardFromImage(
  input: RecognitionInput,
  opts: RecognizeOptions = {},
): Promise<RecognitionResult> {
  let seed: string;
  let ocrNumber: string | undefined;
  let detectedLanguage: string | null = null;
  let englishNumber: string | null = null;
  let englishSetHint: string | null = null;
  
  if (input.type === 'seed') {
    seed = input.name;
  } else if (input.type === 'file' || input.type === 'frame') {
    // 1. Convert file/frame to Base64
    const file = input.type === 'file' ? input.file : input.bitmap; // Wait, input.bitmap is ImageBitmap, we need a File or Blob.
    // In ScanScreen.tsx, we pass `{ type: 'file', file }` for both live camera frames and gallery picker!
    // So it's always type === 'file'.
    if (input.type !== 'file') {
       seed = nextDemoName();
    } else {
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(input.file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = error => reject(error);
        });

        // 1.5. Calculate hash & check Cache
        const imageHash = hashString(base64);
        const localCache = getOcrCache();
        let ocrData: any;

        if (localCache[imageHash]) {
          console.log('[OCR Cache] Hit for image hash:', imageHash);
          ocrData = localCache[imageHash].data;
          
          // Refresh access timestamp (LRU update)
          localCache[imageHash].timestamp = Date.now();
          setOcrCache(localCache);
        } else {
          console.log('[OCR Cache] Miss for image hash:', imageHash);
          // 2. Send to Vercel Serverless Function
          const ocrRes = await fetch('/api/recognize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64 }),
            signal: opts.signal,
          });

          if (!ocrRes.ok) {
             throw new Error(await ocrRes.text());
          }

          ocrData = await ocrRes.json();
          if (ocrData.cardName) {
            saveToOcrCache(imageHash, ocrData);
          }
        }

        if (!ocrData.cardName) {
           return buildEmptyResult('no_match');
        }

        seed = ocrData.cardName;
        ocrNumber = ocrData.number;
        detectedLanguage = ocrData.language ?? null;
        englishNumber = ocrData.englishNumber ?? null;
        englishSetHint = ocrData.englishSetHint ?? null;
      } catch (err) {
        if (
          err &&
          typeof err === 'object' &&
          'aborted' in err &&
          (err as { aborted: boolean }).aborted
        ) {
          throw err;
        }
        console.error('OCR fallback to demo:', err);
        return buildEmptyResult('network'); // Or we could fallback to Charizard, but better to fail so they know it didn't work.
      }
    }
  } else {
    seed = nextDemoName();
  }

  // Si no tenemos seed a estas alturas (por ejemplo si falló algo), usamos fallback
  if (!seed) seed = nextDemoName();

  const cacheKey = seed.toLowerCase() + (ocrNumber ? `-${ocrNumber}` : '');
  const cached = seedCache.get(cacheKey);
  if (cached) {
    return buildRecognitionResultFromApiCard(cached, {
      confidence: 0.92,
      source: 'api_lookup',
      simulated: false,
      detectedLanguage,
    });
  }

  try {
    // Si la carta no es en inglés (ej. japonés) e identificamos un número equivalente, lo usamos
    let targetNumber = ocrNumber;
    if (detectedLanguage && detectedLanguage !== 'EN' && englishNumber) {
      targetNumber = englishNumber;
    }

    const cleanNum = targetNumber ? targetNumber.split('/')[0].replace(/^[0]+/, '').trim() : '';

    // Si identificamos un set equivalente, intentamos buscar su ID oficial
    let targetSetId: string | null = null;
    if (englishSetHint) {
      try {
        const sets = await getSets({ signal: opts.signal });
        const hint = englishSetHint.toLowerCase().trim();
        const matchedSet = sets.find(
          (s) =>
            s.name.toLowerCase().includes(hint) ||
            hint.includes(s.name.toLowerCase()) ||
            s.id.toLowerCase() === hint
        );
        if (matchedSet) {
          targetSetId = matchedSet.id;
        }
      } catch (err) {
        console.error('Error fetching sets for hint matching:', err);
      }
    }

    const cleanSeed = seed.replace(/["\\]/g, '').trim();
    const seedWords = cleanSeed.split(/\s+/).filter(Boolean);
    const nameQuery = seedWords.length > 0 ? seedWords.map((w) => `name:*${w}*`).join(' AND ') : '';
    const firstWordQuery = seedWords.length > 0 ? `name:*${seedWords[0]}*` : '';

    let res: any = { data: [] };

    // Capa 1: Búsqueda precisa (Nombre + Número + Set)
    if (nameQuery && cleanNum && targetSetId) {
      const q = `${nameQuery} AND number:"${cleanNum}" AND set.id:${targetSetId}`;
      res = await searchCards({ q, pageSize: 4, orderBy: '-set.releaseDate' }, { signal: opts.signal });
    }

    // Capa 2: Nombre + Número (Si falló la Capa 1 o no teníamos Set)
    if (res.data.length === 0 && nameQuery && cleanNum) {
      const q = `${nameQuery} AND number:"${cleanNum}"`;
      res = await searchCards({ q, pageSize: 4, orderBy: '-set.releaseDate' }, { signal: opts.signal });
    }

    // Capa 3: Nombre completo (Si falló la Capa 2 o no teníamos Número)
    if (res.data.length === 0 && nameQuery) {
      const q = nameQuery;
      res = await searchCards({ q, pageSize: 4, orderBy: '-set.releaseDate' }, { signal: opts.signal });
    }

    // Capa 4: Primer término del nombre (Si falló la Capa 3 - súper robusto)
    if (res.data.length === 0 && firstWordQuery) {
      const q = firstWordQuery;
      res = await searchCards({ q, pageSize: 4, orderBy: '-set.releaseDate' }, { signal: opts.signal });
    }

    if (res.data.length === 0) return buildEmptyResult('no_match');

    // Prefer a card that has a market price + a usable image
    const detected =
      res.data.find(
        (c: any) =>
          Boolean(c.images?.large || c.images?.small) &&
          Boolean(c.tcgplayer || c.cardmarket),
      ) ?? res.data[0];

    seedCache.set(cacheKey, detected);
    return buildRecognitionResultFromApiCard(detected, {
      confidence: targetNumber ? 0.98 : 0.85,
      source: 'api_lookup',
      simulated: false,
      detectedLanguage,
    });
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'aborted' in err &&
      (err as { aborted: boolean }).aborted
    ) {
      throw err;
    }
    return buildEmptyResult('network');
  }
}

/**
 * Reset the demo state — used by the scanner's "close" handler so reopening
 * the scanner doesn't keep showing the same Charizard forever.
 */
export function resetRecognitionDemo(): void {
  demoIndex = 0;
}
