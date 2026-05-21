/**
 * @vitest-environment jsdom
 *
 * Tests for libraryHelpers.ts — the core filtering and sorting logic
 * that powers LibraryScreen. These are the most critical business-logic
 * functions in the Library feature.
 */
import { describe, it, expect } from 'vitest';
import {
  parseAdvancedQuery,
  matchesAdvancedFilters,
  mapTypeToEnglish,
  mapRarityToEnglish,
  base64ToFile,
} from './libraryHelpers';
import type { PokemonCard } from '@/types/pokemon';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<PokemonCard> = {}): PokemonCard {
  return {
    id: 'test-1',
    name: 'Pikachu',
    supertype: 'Pokémon',
    subtypes: ['Basic'],
    types: ['Lightning'],
    hp: '60',
    number: '25',
    rarity: 'Common',
    set: {
      id: 'base1',
      name: 'Base Set',
      series: 'Base',
      printedTotal: 102,
      total: 102,
      legalities: {},
      ptcgoCode: 'BS',
      releaseDate: '1999/01/09',
      updatedAt: '2020/08/14 09:35:00',
      images: { symbol: '', logo: '' },
    },
    images: { small: '', large: '' },
    ...overrides,
  } as PokemonCard;
}

// ─── parseAdvancedQuery ──────────────────────────────────────────────────────

describe('parseAdvancedQuery', () => {
  it('parses a plain name query', () => {
    const result = parseAdvancedQuery('pikachu');
    expect(result.name).toBe('pikachu');
    expect(result.types).toEqual([]);
    expect(result.rarities).toEqual([]);
  });

  it('parses type filter with t: prefix', () => {
    const result = parseAdvancedQuery('t:fuego');
    expect(result.types).toContain('fuego');
    expect(result.name).toBeUndefined();
  });

  it('parses type filter with tipo: prefix', () => {
    const result = parseAdvancedQuery('tipo:agua');
    expect(result.types).toContain('agua');
  });

  it('parses type filter with type: prefix', () => {
    const result = parseAdvancedQuery('type:psychic');
    expect(result.types).toContain('psychic');
  });

  it('parses rarity filter with r: prefix', () => {
    const result = parseAdvancedQuery('r:rare');
    expect(result.rarities).toContain('rare');
  });

  it('parses rarity filter with rareza: prefix', () => {
    const result = parseAdvancedQuery('rareza:secret');
    expect(result.rarities).toContain('secret');
  });

  it('parses hp> filter', () => {
    const result = parseAdvancedQuery('hp>120');
    expect(result.hpMin).toBe(120);
    expect(result.hpMax).toBeUndefined();
  });

  it('parses hp< filter', () => {
    const result = parseAdvancedQuery('hp<80');
    expect(result.hpMax).toBe(80);
    expect(result.hpMin).toBeUndefined();
  });

  it('parses hp= filter (sets both min and max)', () => {
    const result = parseAdvancedQuery('hp=100');
    expect(result.hpMin).toBe(100);
    expect(result.hpMax).toBe(100);
  });

  it('parses combined query: name + type + rarity', () => {
    const result = parseAdvancedQuery('charizard t:fuego r:rare');
    expect(result.name).toBe('charizard');
    expect(result.types).toContain('fuego');
    expect(result.rarities).toContain('rare');
  });

  it('handles empty string', () => {
    const result = parseAdvancedQuery('');
    expect(result.name).toBeUndefined();
    expect(result.types).toEqual([]);
    expect(result.rarities).toEqual([]);
  });

  it('trims whitespace correctly', () => {
    const result = parseAdvancedQuery('  pikachu  ');
    expect(result.name).toBe('pikachu');
  });
});

// ─── matchesAdvancedFilters ──────────────────────────────────────────────────

describe('matchesAdvancedFilters', () => {
  it('returns true when no filters are set', () => {
    const card = makeCard();
    expect(matchesAdvancedFilters(card, { types: [], rarities: [] })).toBe(true);
  });

  it('matches by name (partial, case-insensitive)', () => {
    const card = makeCard({ name: 'Charizard EX' });
    expect(matchesAdvancedFilters(card, { name: 'charizard', types: [], rarities: [] })).toBe(true);
    expect(matchesAdvancedFilters(card, { name: 'pikachu', types: [], rarities: [] })).toBe(false);
  });

  it('matches by card number', () => {
    const card = makeCard({ number: '4' });
    expect(matchesAdvancedFilters(card, { name: '4', types: [], rarities: [] })).toBe(true);
  });

  it('matches by set name', () => {
    const card = makeCard({ set: { ...makeCard().set!, name: 'Temporal Forces' } } as any);
    expect(matchesAdvancedFilters(card, { name: 'temporal', types: [], rarities: [] })).toBe(true);
  });

  it('matches by English type', () => {
    const card = makeCard({ types: ['Fire'] });
    expect(matchesAdvancedFilters(card, { types: ['fire'], rarities: [] })).toBe(true);
  });

  it('matches by Spanish type (via mapTypeToEnglish)', () => {
    const card = makeCard({ types: ['Fire'] });
    expect(matchesAdvancedFilters(card, { types: ['fuego'], rarities: [] })).toBe(true);
  });

  it('rejects card with wrong type', () => {
    const card = makeCard({ types: ['Water'] });
    expect(matchesAdvancedFilters(card, { types: ['fuego'], rarities: [] })).toBe(false);
  });

  it('matches by rarity (partial)', () => {
    const card = makeCard({ rarity: 'Rare Holo' });
    expect(matchesAdvancedFilters(card, { types: [], rarities: ['rare'] })).toBe(true);
  });

  it('rejects card with wrong rarity', () => {
    const card = makeCard({ rarity: 'Common' });
    expect(matchesAdvancedFilters(card, { types: [], rarities: ['secret'] })).toBe(false);
  });

  it('filters by hpMin correctly', () => {
    const card = makeCard({ hp: '130' });
    expect(matchesAdvancedFilters(card, { types: [], rarities: [], hpMin: 120 })).toBe(true);
    expect(matchesAdvancedFilters(card, { types: [], rarities: [], hpMin: 140 })).toBe(false);
  });

  it('filters by hpMax correctly', () => {
    const card = makeCard({ hp: '60' });
    expect(matchesAdvancedFilters(card, { types: [], rarities: [], hpMax: 80 })).toBe(true);
    expect(matchesAdvancedFilters(card, { types: [], rarities: [], hpMax: 50 })).toBe(false);
  });

  it('rejects cards with non-numeric HP when HP filter is applied', () => {
    const card = makeCard({ hp: undefined });
    expect(matchesAdvancedFilters(card, { types: [], rarities: [], hpMin: 60 })).toBe(false);
  });

  it('applies multiple filters combined (AND logic)', () => {
    const card = makeCard({ name: 'Mew', types: ['Psychic'], rarity: 'Rare', hp: '120' });
    // All match → true
    expect(
      matchesAdvancedFilters(card, {
        name: 'mew',
        types: ['psychic'],
        rarities: ['rare'],
        hpMin: 100,
      }),
    ).toBe(true);
    // Name matches but wrong type → false
    expect(
      matchesAdvancedFilters(card, {
        name: 'mew',
        types: ['fire'],
        rarities: [],
      }),
    ).toBe(false);
  });
});

// ─── mapTypeToEnglish ────────────────────────────────────────────────────────

describe('mapTypeToEnglish', () => {
  it('maps Spanish fire', () => expect(mapTypeToEnglish('fuego')).toBe('fire'));
  it('maps Spanish water', () => expect(mapTypeToEnglish('agua')).toBe('water'));
  it('maps Spanish grass', () => expect(mapTypeToEnglish('planta')).toBe('grass'));
  it('maps Spanish lightning (rayo)', () => expect(mapTypeToEnglish('rayo')).toBe('lightning'));
  it('maps Spanish lightning (electrico)', () => expect(mapTypeToEnglish('electrico')).toBe('lightning'));
  it('maps Spanish psychic (psiquico)', () => expect(mapTypeToEnglish('psiquico')).toBe('psychic'));
  it('maps Spanish fighting', () => expect(mapTypeToEnglish('lucha')).toBe('fighting'));
  it('maps Spanish darkness', () => expect(mapTypeToEnglish('oscuridad')).toBe('darkness'));
  it('maps Spanish metal (acero)', () => expect(mapTypeToEnglish('acero')).toBe('metal'));
  it('maps Spanish dragon', () => expect(mapTypeToEnglish('dragon')).toBe('dragon'));
  it('maps Spanish colorless', () => expect(mapTypeToEnglish('incoloro')).toBe('colorless'));
  it('passes through unknown types unchanged', () => expect(mapTypeToEnglish('unknown')).toBe('unknown'));
});

// ─── mapRarityToEnglish ──────────────────────────────────────────────────────

describe('mapRarityToEnglish', () => {
  it('maps comun to common', () => expect(mapRarityToEnglish('comun')).toBe('common'));
  it('maps común to common', () => expect(mapRarityToEnglish('común')).toBe('common'));
  it('maps infrecuente to uncommon', () => expect(mapRarityToEnglish('infrecuente')).toBe('uncommon'));
  it('maps rara to rare', () => expect(mapRarityToEnglish('rara')).toBe('rare'));
  it('maps secreta to secret', () => expect(mapRarityToEnglish('secreta')).toBe('secret'));
  it('passes through English rarities unchanged', () => expect(mapRarityToEnglish('rare')).toBe('rare'));
});

// ─── base64ToFile ────────────────────────────────────────────────────────────

describe('base64ToFile', () => {
  it('converts a valid data-URI to a File object with correct name and type', () => {
    // 1x1 white PNG — minimal valid base64 image
    const dataUri =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';
    const file = base64ToFile(dataUri, 'test.png');
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('test.png');
    expect(file.type).toBe('image/png');
    expect(file.size).toBeGreaterThan(0);
  });
});
