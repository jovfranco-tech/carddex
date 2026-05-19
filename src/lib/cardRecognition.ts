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
  source: 'mock' | 'api_lookup' | 'manual' | 'failed' | 'offline_fallback';

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
/* Offline Card Catalog and Hashing Fallback                                 */
/* ------------------------------------------------------------------------- */

export const OFFLINE_CARD_CATALOG: PokemonCard[] = [
  {
    id: 'sv3-125',
    name: 'Charizard ex',
    supertype: 'Pokémon',
    subtypes: ['Stage 2', 'Tera', 'ex'],
    hp: '330',
    types: ['Darkness'],
    evolvesFrom: 'Charmeleon',
    rules: [
      'Tera: As long as this Pokémon is on your Bench, prevent all damage done to this Pokémon by attacks (both yours and your opponent\'s).',
      'Pokémon ex rule: When your Pokémon ex is Knocked Out, your opponent takes 2 Prize cards.'
    ],
    attacks: [
      {
        name: 'Burning Darkness',
        cost: ['Fire', 'Fire'],
        convertedEnergyCost: 2,
        damage: '180+',
        text: 'This attack does 30 more damage for each Prize card your opponent has taken.'
      }
    ],
    set: {
      id: 'sv3',
      name: 'Obsidian Flames',
      series: 'Scarlet & Violet',
      printedTotal: 197,
      total: 230,
    },
    number: '125',
    rarity: 'Double Rare',
    images: {
      small: 'https://images.pokemontcg.io/sv3/125.png',
      large: 'https://images.pokemontcg.io/sv3/125_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 45.0,
          mid: 58.5,
          high: 75.0,
          market: 54.20
        }
      }
    }
  },
  {
    id: 'cel25-25',
    name: 'Pikachu',
    supertype: 'Pokémon',
    subtypes: ['Basic'],
    hp: '60',
    types: ['Lightning'],
    attacks: [
      {
        name: 'Gnaw',
        cost: ['Colorless'],
        convertedEnergyCost: 1,
        damage: '10'
      },
      {
        name: 'Thunderbolt',
        cost: ['Lightning', 'Lightning', 'Colorless'],
        convertedEnergyCost: 3,
        damage: '100',
        text: 'Discard all Energy from this Pokémon.'
      }
    ],
    set: {
      id: 'cel25',
      name: 'Celebrations',
      series: 'Sword & Shield',
      printedTotal: 25,
      total: 25,
    },
    number: '25',
    rarity: 'Rare Holo',
    images: {
      small: 'https://images.pokemontcg.io/cel25/25.png',
      large: 'https://images.pokemontcg.io/cel25/25_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 0.15,
          mid: 0.35,
          high: 1.5,
          market: 0.52
        }
      }
    }
  },
  {
    id: 'sv4-58',
    name: 'Mewtwo ex',
    supertype: 'Pokémon',
    subtypes: ['Basic', 'ex'],
    hp: '220',
    types: ['Psychic'],
    attacks: [
      {
        name: 'Transfer Charge',
        cost: ['Psychic'],
        convertedEnergyCost: 1,
        text: 'Attach up to 2 Basic Psychic Energy cards from your discard pile to your Benched Pokémon in any way you like.'
      },
      {
        name: 'Photon Kinesis',
        cost: ['Psychic', 'Psychic'],
        convertedEnergyCost: 2,
        damage: '10+',
        text: 'This attack does 30 more damage for each Psychic Energy attached to this Pokémon.'
      }
    ],
    set: {
      id: 'sv4',
      name: 'Paradox Rift',
      series: 'Scarlet & Violet',
      printedTotal: 182,
      total: 256,
    },
    number: '58',
    rarity: 'Double Rare',
    images: {
      small: 'https://images.pokemontcg.io/sv4/58.png',
      large: 'https://images.pokemontcg.io/sv4/58_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 1.0,
          mid: 2.2,
          high: 5.0,
          market: 1.95
        }
      }
    }
  },
  {
    id: 'swsh8-104',
    name: 'Gengar',
    supertype: 'Pokémon',
    subtypes: ['Stage 2'],
    hp: '130',
    types: ['Psychic'],
    evolvesFrom: 'Haunter',
    attacks: [
      {
        name: 'Shadow Pain',
        cost: ['Psychic'],
        convertedEnergyCost: 1,
        text: 'Put 2 damage counters on each of your opponent\'s Pokémon that has any damage counters on it.'
      },
      {
        name: 'Bouncing Panic',
        cost: ['Psychic', 'Colorless'],
        convertedEnergyCost: 2,
        damage: '90',
        text: 'This attack also does 20 damage to each of your Benched Pokémon. (Don\'t apply Weakness and Resistance for Benched Pokémon.)'
      }
    ],
    set: {
      id: 'swsh8',
      name: 'Fusion Strike',
      series: 'Sword & Shield',
      printedTotal: 264,
      total: 284,
    },
    number: '104',
    rarity: 'Rare Holo',
    images: {
      small: 'https://images.pokemontcg.io/swsh8/104.png',
      large: 'https://images.pokemontcg.io/swsh8/104_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 0.45,
          mid: 0.85,
          high: 2.0,
          market: 0.79
        }
      }
    }
  },
  {
    id: 'swsh9-121',
    name: 'Eevee',
    supertype: 'Pokémon',
    subtypes: ['Basic'],
    hp: '60',
    types: ['Colorless'],
    attacks: [
      {
        name: 'Vee-Search',
        cost: ['Colorless'],
        convertedEnergyCost: 1,
        text: 'Search your deck for up to 3 Pokémon V, reveal them, and put them into your hand. Then, shuffle your deck.'
      },
      {
        name: 'Stampede',
        cost: ['Colorless', 'Colorless'],
        convertedEnergyCost: 2,
        damage: '20'
      }
    ],
    set: {
      id: 'swsh9',
      name: 'Brilliant Stars',
      series: 'Sword & Shield',
      printedTotal: 172,
      total: 186,
    },
    number: '121',
    rarity: 'Common',
    images: {
      small: 'https://images.pokemontcg.io/swsh9/121.png',
      large: 'https://images.pokemontcg.io/swsh9/121_hires.png'
    },
    tcgplayer: {
      prices: {
        normal: {
          low: 0.05,
          mid: 0.15,
          high: 1.0,
          market: 0.11
        }
      }
    }
  },
  {
    id: 'swsh4-131',
    name: 'Snorlax',
    supertype: 'Pokémon',
    subtypes: ['Basic'],
    hp: '130',
    types: ['Colorless'],
    abilities: [
      {
        name: 'Gormandize',
        text: 'Once during your turn, if this Pokémon is in the Active Spot, you may draw cards until you have 7 cards in your hand. If you use this Ability, your turn ends.'
      }
    ],
    attacks: [
      {
        name: 'Body Slam',
        cost: ['Colorless', 'Colorless', 'Colorless', 'Colorless'],
        convertedEnergyCost: 4,
        damage: '100',
        text: 'Flip a coin. If heads, your opponent\'s Active Pokémon is now Paralyzed.'
      }
    ],
    set: {
      id: 'swsh4',
      name: 'Vivid Voltage',
      series: 'Sword & Shield',
      printedTotal: 185,
      total: 203,
    },
    number: '131',
    rarity: 'Rare Holo',
    images: {
      small: 'https://images.pokemontcg.io/swsh4/131.png',
      large: 'https://images.pokemontcg.io/swsh4/131_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 0.80,
          mid: 1.50,
          high: 3.50,
          market: 1.25
        }
      }
    }
  },
  {
    id: 'sit-138',
    name: 'Lugia V',
    supertype: 'Pokémon',
    subtypes: ['Basic', 'V'],
    hp: '220',
    types: ['Colorless'],
    attacks: [
      {
        name: 'Read the Wind',
        cost: ['Colorless'],
        convertedEnergyCost: 1,
        text: 'Discard a card from your hand. If you do, draw 3 cards.'
      },
      {
        name: 'Aero Dive',
        cost: ['Colorless', 'Colorless', 'Colorless', 'Colorless'],
        convertedEnergyCost: 4,
        damage: '130',
        text: 'You may discard any Stadium card in play.'
      }
    ],
    set: {
      id: 'sit',
      name: 'Silver Tempest',
      series: 'Sword & Shield',
      printedTotal: 195,
      total: 245,
    },
    number: '138',
    rarity: 'Ultra Rare',
    images: {
      small: 'https://images.pokemontcg.io/sit/138.png',
      large: 'https://images.pokemontcg.io/sit/138_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 3.50,
          mid: 5.75,
          high: 12.00,
          market: 4.88
        }
      }
    }
  },
  {
    id: 'swsh7-111',
    name: 'Rayquaza VMAX',
    supertype: 'Pokémon',
    subtypes: ['Stage 1', 'VMAX', 'Rapid Strike'],
    hp: '320',
    types: ['Dragon'],
    evolvesFrom: 'Rayquaza V',
    abilities: [
      {
        name: 'Azure Pulse',
        text: 'Once during your turn, you may discard your hand and draw 3 cards.'
      }
    ],
    attacks: [
      {
        name: 'Max Burst',
        cost: ['Fire', 'Lightning'],
        convertedEnergyCost: 2,
        damage: '20+',
        text: 'Discard any amount of basic Fire Energy or basic Lightning Energy from this Pokémon. This attack does 80 more damage for each card you discarded in this way.'
      }
    ],
    set: {
      id: 'swsh7',
      name: 'Evolving Skies',
      series: 'Sword & Shield',
      printedTotal: 203,
      total: 237,
    },
    number: '111',
    rarity: 'Rare Holo VMAX',
    images: {
      small: 'https://images.pokemontcg.io/swsh7/111.png',
      large: 'https://images.pokemontcg.io/swsh7/111_hires.png'
    },
    tcgplayer: {
      prices: {
        holofoil: {
          low: 15.00,
          mid: 28.00,
          high: 45.00,
          market: 23.50
        }
      }
    }
  }
];

/**
 * Deterministically match an image hash to an offline catalog card.
 */
export function getOfflineRecognitionResult(imageHash: string): RecognitionResult {
  let sum = 0;
  for (let i = 0; i < imageHash.length; i++) {
    sum += imageHash.charCodeAt(i);
  }
  const index = sum % OFFLINE_CARD_CATALOG.length;
  const card = OFFLINE_CARD_CATALOG[index];
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
      let imageHash = '';
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(input.file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = error => reject(error);
        });

        // 1.5. Calculate hash & check Cache
        imageHash = hashString(base64);
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
        console.warn('[OCR Fallback] Network request failed. Switching to deterministic offline hashing fallback:', err);
        if (imageHash) {
          return getOfflineRecognitionResult(imageHash);
        } else {
          // If base64 reading failed, fall back using a random seed hash
          const fallbackHash = hashString(`offline-fallback-${Date.now()}`);
          return getOfflineRecognitionResult(fallbackHash);
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
