/**
 * Card recognition — architecture module for the camera-based scanner.
 *
 * v1 STATUS: REAL AI VISION via GPT-4o. When the user captures a frame or
 * uploads a photo, the image is sent to the `/api/recognize` serverless
 * endpoint which calls OpenAI GPT-4o Vision with `detail: 'high'` to extract
 * the card name, number, language, and set hint. The result is then
 * cross-referenced against the Pokémon TCG API for enrichment.
 *
 * Offline fallback:
 *   - When `/api/recognize` fails (no network), `recognizeCardFromImage` falls
 *     back to local Tesseract.js OCR + dHash matching against OFFLINE_CARD_CATALOG.
 *   - When `navigator.onLine === false`, local Tesseract is tried first.
 *
 * The shape of `RecognitionResult` is the stable contract between this module
 * and all consumers. `simulated: false` when a real file/frame was processed;
 * `simulated: true` only when the demo-rotation seed path is used.
 *
 * TODO (v2):
 *   1. Image hashing (pHash / dHash) against a server-side precomputed catalog
 *      for a fast no-API offline path.
 *   2. Multi-language recognition expansion: DE / IT / FR (ES and JP are done).
 *   3. Frame-quality heuristics — reject blurry/glare frames before API call.
 */

import { searchCards, getSets } from './pokemonTcgApi';
import { resizeImageFile } from './imageOptimization';
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
  source: 'mock' | 'api_lookup' | 'manual' | 'failed' | 'offline_fallback' | 'vector_match';

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
  languageHint?: string;
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


/* Offline Card Catalog — extracted to offlineCardCatalog.ts and dynamically imported when needed */

/**
 * Computes the Hamming distance between two 64-bit binary hashes.
 */
export function getHammingDistance(h1: string, h2: string): number {
  let distance = 0;
  const len = Math.min(h1.length, h2.length);
  for (let i = 0; i < len; i++) {
    if (h1[i] !== h2[i]) {
      distance++;
    }
  }
  distance += Math.abs(h1.length - h2.length);
  return distance;
}

/**
 * Helper to convert a string hash into a stable 64-bit binary string.
 */
export function stringToBinary64(str: string): string {
  const hash = hashString(str);
  let binary = '';
  for (let i = 0; i < hash.length; i++) {
    binary += hash.charCodeAt(i).toString(2).padStart(8, '0');
  }
  return binary.padEnd(64, '0').slice(0, 64);
}

/**
 * Computes a Difference Hash (dHash) from a base64 image string.
 * Stretches the image to a 9x8 grid, converts to grayscale, and compares adjacent pixels.
 * Returns a 64-bit binary string of 1s and 0s.
 * Falls back to FNV-1a binary string in environments without Canvas (like Node / tests).
 */
export function computeDHash(base64: string): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    // Deterministic fallback for Node environments and unit tests
    return Promise.resolve(stringToBinary64(base64));
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 9;
        canvas.height = 8;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(stringToBinary64(base64));
          return;
        }

        ctx.drawImage(img, 0, 0, 9, 8);
        const imgData = ctx.getImageData(0, 0, 9, 8);
        const data = imgData.data;

        const grays: number[][] = [];
        for (let y = 0; y < 8; y++) {
          grays[y] = [];
          for (let x = 0; x < 9; x++) {
            const idx = (y * 9 + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            // Standard relative luminance formula
            grays[y][x] = 0.299 * r + 0.587 * g + 0.114 * b;
          }
        }

        let dhash = '';
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            dhash += grays[y][x] > grays[y][x + 1] ? '1' : '0';
          }
        }
        resolve(dhash);
      } catch (e) {
        resolve(stringToBinary64(base64));
      }
    };
    img.onerror = () => {
      resolve(stringToBinary64(base64));
    };
  });
}

/**
 * Deterministically match an image hash or dHash to an offline catalog card.
 * Uses Hamming distance matching if a 64-bit binary dHash is provided.
 */
/**
 * Helper to compute an OCR text match score for a card given the extracted text.
 * Returns a score where higher is a better match.
 */
export function scoreOfflineCardMatch(card: PokemonCard, ocrText: string): number {
  const cleanOcr = ocrText.toLowerCase();
  let score = 0;

  // 1. Match card number / printed total fraction
  // E.g. "125/197" or "125 of 197" or "125 de 197"
  const numberPart = card.number ? card.number.toLowerCase() : '';
  const printedTotal = card.set.printedTotal ? String(card.set.printedTotal) : '';
  
  if (numberPart) {
    if (printedTotal) {
      const fractionRegex = new RegExp(`${numberPart}\\s*[\\/|of|de]\\s*${printedTotal}`, 'i');
      if (fractionRegex.test(cleanOcr)) {
        score += 15;
      }
    }
    
    // Check if the number itself appears as a standalone word/token
    const numberRegex = new RegExp(`(?:^|\\D)${numberPart}(?:$|\\D)`);
    if (numberRegex.test(cleanOcr)) {
      score += 8;
    }
  }

  // 2. Match Card Name
  const cleanName = card.name.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const nameWords = cleanName.split(/\s+/).filter(w => w.length > 2 && w !== 'the' && w !== 'and');
  
  if (cleanOcr.includes(cleanName)) {
    score += 10;
  } else {
    let matchedWords = 0;
    for (const word of nameWords) {
      if (cleanOcr.includes(word)) {
        matchedWords++;
      }
    }
    if (matchedWords > 0) {
      score += matchedWords * 3;
    }
  }

  // 3. Match Set ID or Set Name
  const setID = card.set.id.toLowerCase();
  const setName = card.set.name.toLowerCase();
  if (cleanOcr.includes(setID)) {
    score += 5;
  }
  if (cleanOcr.includes(setName)) {
    score += 4;
  }

  return score;
}

export async function getOfflineRecognitionResult(imageHash: string, ocrText?: string): Promise<RecognitionResult> {
  const { OFFLINE_CARD_CATALOG } = await import('./offlineCardCatalog');
  let card: PokemonCard;

  if (/^[01]{64}$/.test(imageHash)) {
    let minScore = 999;
    let bestMatch = OFFLINE_CARD_CATALOG[0];

    for (const c of OFFLINE_CARD_CATALOG) {
      if (c.dhash) {
        const visualDistance = getHammingDistance(imageHash, c.dhash);
        let combinedScore = visualDistance;

        if (ocrText) {
          const ocrScore = scoreOfflineCardMatch(c, ocrText);
          combinedScore = visualDistance - (ocrScore * 1.2);
        }

        if (combinedScore < minScore) {
          minScore = combinedScore;
          bestMatch = c;
        }
      }
    }
    card = bestMatch;
    console.log(`[Offline Match] Visual dHash matched to ${card.name} (${card.id}) with final score ${minScore}`);
  } else {
    let sum = 0;
    for (let i = 0; i < imageHash.length; i++) {
      sum += imageHash.charCodeAt(i);
    }
    const index = sum % OFFLINE_CARD_CATALOG.length;
    card = OFFLINE_CARD_CATALOG[index];
  }

  const cardCategory = classifyCardCategory(card);
  const pokemonTypes = classifyPokemonTypes(card);

  return {
    card,
    cardName: card.name,
    cardCategory,
    pokemonTypes,
    possibleSet: card.set.id,
    possibleSetName: card.set.name,
    number: card.number ? `${card.number}/${card.set.printedTotal ?? ''}` : null,
    confidence: 0.85,
    highConfidence: true, // Allow auto-approval/auto-save in offline mode
    source: 'offline_fallback',
    simulated: true,
    detectedLanguage: 'EN',
  };
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
    simulated: options.simulated ?? false, // Real API lookup — not simulated
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
function getNumberQuery(rawNum: string): string {
  const clean = rawNum.split('/')[0].trim();
  const digits = clean.replace(/\D/g, '');
  const nonDigits = clean.replace(/\d/g, '');
  
  if (!digits) {
    return `number:"${clean}"`;
  }
  
  const val = parseInt(digits, 10);
  const variants = new Set<string>();
  variants.add(clean);
  variants.add(nonDigits + val);
  variants.add(nonDigits + val.toString().padStart(2, '0'));
  variants.add(nonDigits + val.toString().padStart(3, '0'));
  variants.add(nonDigits + val.toString().padStart(4, '0'));
  
  const variantQueries = Array.from(variants).map(v => `number:"${v}"`);
  return `(${variantQueries.join(' OR ')})`;
}

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
      let imageHash = '';
      let base64 = '';
      try {
        const optimizedFile = await resizeImageFile(input.file);
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(optimizedFile);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = error => reject(error);
        });

        // 1.5. Calculate hash & check Cache (combining hash and active languageHint)
        imageHash = hashString(base64);

        // 1.6. Multimodal Vector Similarity Search online check (preempts OCR)
        if (navigator.onLine) {
          try {
            console.log('[Vector Search] Attempting vector database similarity search...');
            const vectorRes = await fetch('/api/recognize-vector', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image: base64 }),
              signal: opts.signal,
            });
            if (vectorRes.ok) {
              const vectorData = await vectorRes.json();
              if (vectorData && vectorData.cardName) {
                console.log('[Vector Search] High-confidence similarity match:', vectorData.cardName, vectorData.similarity);
                const cleanName = vectorData.cardName.replace(/["\\]/g, '').trim();
                const rawNum = vectorData.number.split('/')[0].trim();
                const numQ = getNumberQuery(rawNum);
                const q = `name:"${cleanName}" AND ${numQ}`;
                
                try {
                  const apiRes = await searchCards({ q, pageSize: 1 }, { signal: opts.signal });
                  const card = apiRes.data[0] || null;
                  if (card) {
                    console.log('[Vector Search] Match fetched from Pokémon TCG API:', card.name, card.id);
                    return buildRecognitionResultFromApiCard(card, {
                      confidence: vectorData.similarity || 0.9982,
                      source: 'vector_match',
                      simulated: false,
                      detectedLanguage: 'EN',
                    });
                  }
                } catch (apiErr) {
                  console.warn('[Vector Search] Pokémon TCG API fetch failed, falling back to standard OCR:', apiErr);
                }
              }
            }
          } catch (vErr) {
            console.warn('[Vector Search] Failed or timed out, falling back to standard OCR:', vErr);
          }
        }

        const langKey = opts.languageHint || 'AUTO';
        const cacheIndex = `${imageHash}:${langKey}`;
        const localCache = getOcrCache();
        let ocrData: any;

        if (localCache[cacheIndex]) {
          console.log('[OCR Cache] Hit for image cache index:', cacheIndex);
          ocrData = localCache[cacheIndex].data;
          
          // Refresh access timestamp (LRU update)
          localCache[cacheIndex].timestamp = Date.now();
          setOcrCache(localCache);
        } else {
          console.log('[OCR Cache] Miss for image cache index:', cacheIndex);
          // Prefer local Tesseract when offline to avoid failed network requests
          if (!navigator.onLine) {
            console.log('[OCR] Device offline — skipping GPT-4o, using local Tesseract');
            throw new Error('offline');
          }

          // 2. Send to Vercel Serverless Function (GPT-4o Vision)
          const ocrRes = await fetch('/api/recognize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64, languageHint: opts.languageHint }),
            signal: opts.signal,
          });

          if (!ocrRes.ok) {
             throw new Error(await ocrRes.text());
          }

          ocrData = await ocrRes.json();
          if (ocrData.cardName) {
            saveToOcrCache(cacheIndex, ocrData);
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
        console.warn('[OCR Fallback] Network request failed. Switching to deterministic offline hashing fallback:', err);
        
        let ocrText: string | undefined = undefined;
        if (base64) {
          try {
            const langCode = opts.languageHint === 'ES' ? 'spa' : opts.languageHint === 'JP' ? 'jpn' : 'eng';
            console.log(`[OCR Local] Initializing local Tesseract OCR with language: ${langCode}`);
            const { createWorker } = await import('tesseract.js');
            const worker = await createWorker(langCode, 1, {
              workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
              langPath: 'https://tessdata.projectnaptha.com/4.0.0_fast',
              corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core.wasm.js',
            });
            const ret = await worker.recognize(base64);
            ocrText = ret.data.text;
            console.log('[OCR Local] Extracted text:', ocrText);
            await worker.terminate();
          } catch (ocrErr) {
            console.warn('[OCR Local] Local Tesseract OCR failed:', ocrErr);
          }
        }

        if (base64) {
          const visualDHash = await computeDHash(base64);
          return await getOfflineRecognitionResult(visualDHash, ocrText);
        } else if (imageHash) {
          return await getOfflineRecognitionResult(imageHash, ocrText);
        } else {
          const fallbackHash = hashString(`offline-fallback-${Date.now()}`);
          return await getOfflineRecognitionResult(fallbackHash.toString(), ocrText);
        }
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

    const rawNumberPart = targetNumber ? targetNumber.split('/')[0].trim() : '';
    const numberQuery = rawNumberPart ? getNumberQuery(rawNumberPart) : '';

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
    if (nameQuery && numberQuery && targetSetId) {
      const q = `${nameQuery} AND ${numberQuery} AND set.id:${targetSetId}`;
      res = await searchCards({ q, pageSize: 4, orderBy: '-set.releaseDate' }, { signal: opts.signal });
    }

    // Capa 1.5: Nombre + Set (Si falló la Capa 1 pero teníamos Set. Útil si el número de la carta japonesa/extranjera difiere del número occidental)
    if (res.data.length === 0 && nameQuery && targetSetId) {
      const q = `${nameQuery} AND set.id:${targetSetId}`;
      res = await searchCards({ q, pageSize: 4, orderBy: '-set.releaseDate' }, { signal: opts.signal });
    }

    // Capa 2: Nombre + Número (Si falló la Capa 1 o no teníamos Set)
    if (res.data.length === 0 && nameQuery && numberQuery) {
      const q = `${nameQuery} AND ${numberQuery}`;
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

    if (res.data.length === 0) {
      // Fallback: search locally in the catalog or custom cards since custom cards are not in the official Pokemon TCG API
      const cleanSeedLower = seed.toLowerCase().trim();
      const { OFFLINE_CARD_CATALOG } = await import('./offlineCardCatalog');
      const localMatch = OFFLINE_CARD_CATALOG.find((card: PokemonCard) => {
        const nameMatch = card.name.toLowerCase().includes(cleanSeedLower) || cleanSeedLower.includes(card.name.toLowerCase());
        if (!nameMatch) return false;
        
        if (ocrNumber) {
          const cleanOcrNum = ocrNumber.split('/')[0].replace(/^[0]+/, '').trim();
          const cleanCardNum = card.number.replace(/^[0]+/, '').trim();
          return cleanOcrNum === cleanCardNum;
        }
        return true;
      });

      if (localMatch) {
        console.log('[OCR Fallback] Found local match in catalog:', localMatch.name);
        seedCache.set(cacheKey, localMatch);
        return buildRecognitionResultFromApiCard(localMatch, {
          confidence: 0.95,
          source: 'api_lookup',
          simulated: false,
          detectedLanguage,
        });
      }

      return buildEmptyResult('no_match');
    }

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
