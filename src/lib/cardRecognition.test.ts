import { describe, expect, it } from 'vitest';
import type { PokemonCard } from '@/types/pokemon';
import {
  buildRecognitionResultFromApiCard,
  classifyCardCategory,
  classifyPokemonTypes,
  getRecognitionConfidence,
  HIGH_CONFIDENCE_THRESHOLD,
  hashString,
  getOfflineRecognitionResult,
  scoreOfflineCardMatch,
  getHammingDistance,
  computeDHash,
  stringToBinary64,
} from './cardRecognition';
import { OFFLINE_CARD_CATALOG } from './offlineCardCatalog';

function makeCard(over: Partial<PokemonCard> = {}): PokemonCard {
  return {
    id: 'swsh1-25',
    name: 'Sample Card',
    images: {},
    number: '25',
    set: {
      id: 'swsh1',
      name: 'Sword & Shield',
      series: 'Sword & Shield',
      printedTotal: 202,
    },
    ...over,
  };
}

describe('classifyCardCategory', () => {
  it('returns Pokémon for the accented and unaccented supertype', () => {
    expect(classifyCardCategory(makeCard({ supertype: 'Pokémon' }))).toBe('Pokémon');
    expect(classifyCardCategory(makeCard({ supertype: 'Pokemon' }))).toBe('Pokémon');
  });

  it('returns Trainer for Trainer supertype', () => {
    expect(classifyCardCategory(makeCard({ supertype: 'Trainer' }))).toBe('Trainer');
  });

  it('returns Energy for Energy supertype', () => {
    expect(classifyCardCategory(makeCard({ supertype: 'Energy' }))).toBe('Energy');
  });

  it('returns Unknown for null, undefined or missing supertype', () => {
    expect(classifyCardCategory(null)).toBe('Unknown');
    expect(classifyCardCategory(undefined)).toBe('Unknown');
    expect(classifyCardCategory(makeCard())).toBe('Unknown');
  });

  it('is case-insensitive on the supertype string', () => {
    expect(classifyCardCategory(makeCard({ supertype: 'TRAINER' }))).toBe('Trainer');
    expect(classifyCardCategory(makeCard({ supertype: 'energy' }))).toBe('Energy');
  });
});

describe('classifyPokemonTypes', () => {
  it('returns the elemental types when the card is a Pokémon', () => {
    expect(
      classifyPokemonTypes(
        makeCard({ supertype: 'Pokémon', types: ['Fire', 'Dragon'] }),
      ),
    ).toEqual(['Fire', 'Dragon']);
  });

  it('returns an empty array for Trainer / Energy cards (even if API returns types)', () => {
    expect(
      classifyPokemonTypes(makeCard({ supertype: 'Trainer', types: ['Colorless'] })),
    ).toEqual([]);
    expect(
      classifyPokemonTypes(makeCard({ supertype: 'Energy', types: ['Lightning'] })),
    ).toEqual([]);
  });

  it('returns an empty array when types is missing or empty', () => {
    expect(classifyPokemonTypes(makeCard({ supertype: 'Pokémon' }))).toEqual([]);
    expect(
      classifyPokemonTypes(makeCard({ supertype: 'Pokémon', types: [] })),
    ).toEqual([]);
  });

  it('returns an empty array for nullish input', () => {
    expect(classifyPokemonTypes(null)).toEqual([]);
    expect(classifyPokemonTypes(undefined)).toEqual([]);
  });
});

describe('buildRecognitionResultFromApiCard', () => {
  it('fills the result with API-derived fields for a normal Pokémon card', () => {
    const card = makeCard({
      supertype: 'Pokémon',
      types: ['Fire'],
      number: '4',
    });
    const r = buildRecognitionResultFromApiCard(card);
    expect(r.card).toBe(card);
    expect(r.cardName).toBe('Sample Card');
    expect(r.cardCategory).toBe('Pokémon');
    expect(r.pokemonTypes).toEqual(['Fire']);
    expect(r.possibleSet).toBe('swsh1');
    expect(r.possibleSetName).toBe('Sword & Shield');
    expect(r.number).toBe('4/202');
    expect(r.source).toBe('api_lookup');
    expect(r.simulated).toBe(false);
    expect(r.detectedLanguage).toBeNull();
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('honors explicit overrides for confidence/source/simulated/language', () => {
    const card = makeCard({ supertype: 'Trainer' });
    const r = buildRecognitionResultFromApiCard(card, {
      confidence: 1,
      source: 'manual',
      simulated: false,
      detectedLanguage: 'ES',
    });
    expect(r.confidence).toBe(1);
    expect(r.source).toBe('manual');
    expect(r.simulated).toBe(false);
    expect(r.detectedLanguage).toBe('ES');
    expect(r.highConfidence).toBe(true);
  });

  it('does not produce a "N/total" number when printedTotal is missing', () => {
    const card = makeCard({
      number: '42',
      set: { id: 'swsh1', name: 'Sword & Shield', series: 'SS' },
    });
    expect(buildRecognitionResultFromApiCard(card).number).toBe('42');
  });
});

describe('getRecognitionConfidence', () => {
  it('returns 0 when there is no API match at all', () => {
    expect(
      getRecognitionConfidence({
        card: null,
        cardName: '',
        cardCategory: 'Unknown',
        number: null,
        possibleSet: null,
      }),
    ).toBe(0);
  });

  it('scores higher when more fields are populated', () => {
    const cardLike = makeCard();
    const minimal = getRecognitionConfidence({
      card: cardLike,
      cardName: '',
      cardCategory: 'Unknown',
      number: null,
      possibleSet: null,
    });
    const full = getRecognitionConfidence({
      card: cardLike,
      cardName: 'Pikachu',
      cardCategory: 'Pokémon',
      number: '25/102',
      possibleSet: 'base1',
    });
    expect(full).toBeGreaterThan(minimal);
    expect(full).toBeLessThanOrEqual(1);
  });

  it('crosses the high-confidence threshold when name + category + number are all known', () => {
    const score = getRecognitionConfidence({
      card: makeCard(),
      cardName: 'Pikachu',
      cardCategory: 'Pokémon',
      number: '25/102',
      possibleSet: 'base1',
    });
    expect(score).toBeGreaterThanOrEqual(HIGH_CONFIDENCE_THRESHOLD);
  });
});

describe('Offline Fallback and Hashing', () => {
  it('hashString computes stable base36 hashes', () => {
    const hash1 = hashString('test-string-123');
    const hash2 = hashString('test-string-123');
    const hash3 = hashString('different-string');
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(typeof hash1).toBe('string');
    expect(hash1.length).toBeGreaterThan(0);
  });

  it('getOfflineRecognitionResult deterministically maps hashes to valid cards', async () => {
    const hash1 = hashString('some-captured-image-bytes-1');
    const hash2 = hashString('some-captured-image-bytes-2');

    const result1 = await getOfflineRecognitionResult(hash1);
    const result2 = await getOfflineRecognitionResult(hash2);

    expect(result1.card).not.toBeNull();
    expect(result2.card).not.toBeNull();
    expect(OFFLINE_CARD_CATALOG).toContain(result1.card);
    expect(OFFLINE_CARD_CATALOG).toContain(result2.card);

    expect(result1.confidence).toBe(0.85);
    expect(result1.highConfidence).toBe(true);
    expect(result1.source).toBe('offline_fallback');
    expect(result1.simulated).toBe(true);
    expect(result1.detectedLanguage).toBe('EN');

    // Repeated call with same hash gives identical result
    const repeatResult = await getOfflineRecognitionResult(hash1);
    expect(repeatResult.card!.id).toBe(result1.card!.id);
  });

  it('getHammingDistance calculates correct differences between binary strings', () => {
    expect(getHammingDistance('000', '000')).toBe(0);
    expect(getHammingDistance('111', '000')).toBe(3);
    expect(getHammingDistance('1010', '0101')).toBe(4);
    // Handles length mismatches gracefully
    expect(getHammingDistance('11', '111')).toBe(1);
  });

  it('stringToBinary64 converts arbitrary strings into stable 64-bit binary strings', () => {
    const bin1 = stringToBinary64('test-string-for-binary');
    const bin2 = stringToBinary64('test-string-for-binary');
    const bin3 = stringToBinary64('completely-different');

    expect(bin1).toBe(bin2);
    expect(bin1).not.toBe(bin3);
    expect(bin1.length).toBe(64);
    expect(/^[01]{64}$/.test(bin1)).toBe(true);
  });

  it('computeDHash falls back gracefully to a 64-bit binary string in tests', async () => {
    const dhash = await computeDHash('mock-base-64-image-string-contents');
    expect(dhash.length).toBe(64);
    expect(/^[01]{64}$/.test(dhash)).toBe(true);
  });

  it('getOfflineRecognitionResult handles 64-bit binary dHash visual matching via Hamming distance', async () => {
    // Mewtwo ex pre-calculated dhash signature is:
    // '0000111100001111110011001100110010101010101010100011110000111100'
    const targetMewtwoDHash = '0000111100001111110011001100110010101010101010100011110000111100';
    
    // We create a slightly modified dhash (with Hamming distance 2)
    const noisyMewtwoDHash = '0000111100001111110011001100110010101010101010100011110000111111';

    const result = await getOfflineRecognitionResult(noisyMewtwoDHash);
    expect(result.card!.name).toBe('Mewtwo ex');
    expect(result.source).toBe('offline_fallback');

    // Verify 2025/2026 Pikachu ex
    const noisyPikachuExHash = '0101010111110000101010101100110000001111000011111111000010101011'; // distance 1
    const pikaResult = await getOfflineRecognitionResult(noisyPikachuExHash);
    expect(pikaResult.card!.id).toBe('zsv10pt5-25');
    expect(pikaResult.card!.name).toBe('Pikachu ex');

    // Verify 2025/2026 Metapod
    const noisyMetapodHash = '1100110011110000000011110101010100111100001111001010101000111111'; // distance 2
    const metapodResult = await getOfflineRecognitionResult(noisyMetapodHash);
    expect(metapodResult.card!.id).toBe('sv9-2');
    expect(metapodResult.card!.name).toBe('Metapod');
  });

  it('scoreOfflineCardMatch calculates correct scores for card attributes', () => {
    const charizard = OFFLINE_CARD_CATALOG.find(c => c.id === 'sv3-125')!;
    expect(charizard).toBeDefined();

    // 1. Exact match of number fraction and name should yield high score
    const score1 = scoreOfflineCardMatch(charizard, 'Charizard ex 125/197 Obsidian Flames');
    expect(score1).toBeGreaterThanOrEqual(30);

    // 2. Just the exact card name
    const score2 = scoreOfflineCardMatch(charizard, 'This is a Charizard ex card');
    expect(score2).toBe(10);

    // 3. Just a word from the card name (partial match)
    const scoreNameWord = scoreOfflineCardMatch(charizard, 'This is a Charizard card');
    expect(scoreNameWord).toBe(3);

    // 4. Just the card number standalone
    const score3 = scoreOfflineCardMatch(charizard, 'Number 125 here');
    expect(score3).toBe(8);

    // 5. No matches at all
    const score4 = scoreOfflineCardMatch(charizard, 'Pikachu 25/150');
    expect(score4).toBe(0);
  });

  it('getOfflineRecognitionResult uses hybrid OCR matching to resolve visually ambiguous cards', async () => {
    // Pikachu ex pre-calculated dhash signature is:
    // '0101010111110000101010101100110000001111000011111111000010101010' (printed total 250 in zsv10pt5)
    const pikachuDHash = '0101010111110000101010101100110000001111000011111111000010101010';

    // Without OCR, the Pikachu dHash matches Pikachu ex
    const visualOnlyResult = await getOfflineRecognitionResult(pikachuDHash);
    expect(visualOnlyResult.card!.name).toBe('Pikachu ex');

    // With Mewtwo ex OCR text, it should override visual match to Mewtwo ex
    const hybridResult = await getOfflineRecognitionResult(pikachuDHash, 'Mewtwo ex 50/88');
    expect(hybridResult.card!.name).toBe('Mewtwo ex');
    expect(hybridResult.card!.id).toBe('me3-50');
  });
});

