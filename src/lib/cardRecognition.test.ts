import { describe, expect, it } from 'vitest';
import type { PokemonCard } from '@/types/pokemon';
import {
  buildRecognitionResultFromApiCard,
  classifyCardCategory,
  classifyPokemonTypes,
  getRecognitionConfidence,
  HIGH_CONFIDENCE_THRESHOLD,
} from './cardRecognition';

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
    expect(r.simulated).toBe(true);
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
