import { describe, expect, it } from 'vitest';
import {
  compareRarity,
  normalizeRarity,
  rarityLabel,
  rarityMatchesFilter,
  raritySortWeight,
} from './rarity';

describe('normalizeRarity', () => {
  it('maps the plain rarities to their canonical groups', () => {
    expect(normalizeRarity('Common')).toBe('Common');
    expect(normalizeRarity('Uncommon')).toBe('Uncommon');
    expect(normalizeRarity('Rare')).toBe('Rare');
  });

  it('handles Holo and Holo-EX variants without colliding', () => {
    expect(normalizeRarity('Rare Holo')).toBe('Rare Holo');
    expect(normalizeRarity('Rare Holo EX')).toBe('Rare Holo EX');
    // "Rare EX" (classic ex cards) should also map to Rare Holo EX, not Rare.
    expect(normalizeRarity('Rare EX')).toBe('Rare Holo EX');
  });

  it('treats GX / V / VMAX / VSTAR / Break as ultra rare', () => {
    expect(normalizeRarity('Rare Holo GX')).toBe('Ultra Rare');
    expect(normalizeRarity('Rare Holo V')).toBe('Ultra Rare');
    expect(normalizeRarity('Rare Holo VMAX')).toBe('Ultra Rare');
    expect(normalizeRarity('Rare Holo VSTAR')).toBe('Ultra Rare');
    expect(normalizeRarity('Rare BREAK')).toBe('Ultra Rare');
  });

  it('recognizes modern Double Rare independently of Holo EX', () => {
    expect(normalizeRarity('Double Rare')).toBe('Double Rare');
  });

  it('routes Illustration / Special Illustration / Hyper rarities correctly', () => {
    expect(normalizeRarity('Illustration Rare')).toBe('Illustration Rare');
    expect(normalizeRarity('Special Illustration Rare')).toBe(
      'Special Illustration Rare',
    );
    expect(normalizeRarity('Hyper Rare')).toBe('Hyper Rare');
  });

  it('treats Secret-ish rarities as Secret Rare', () => {
    expect(normalizeRarity('Rare Secret')).toBe('Secret Rare');
    expect(normalizeRarity('Rare Rainbow')).toBe('Secret Rare');
    expect(normalizeRarity('Rare Shiny')).toBe('Secret Rare');
  });

  it('keeps Amazing Rare and Radiant Rare as distinct groups', () => {
    expect(normalizeRarity('Amazing Rare')).toBe('Amazing Rare');
    expect(normalizeRarity('Radiant Rare')).toBe('Radiant Rare');
  });

  it('detects any flavour of promo', () => {
    expect(normalizeRarity('Promo')).toBe('Promo');
    expect(normalizeRarity('Rare Promo')).toBe('Promo');
    expect(normalizeRarity('Classic Collection Promo')).toBe('Promo');
  });

  it('falls back to Unknown on bad input', () => {
    expect(normalizeRarity(undefined)).toBe('Unknown');
    expect(normalizeRarity(null)).toBe('Unknown');
    expect(normalizeRarity('')).toBe('Unknown');
    expect(normalizeRarity('   ')).toBe('Unknown');
    expect(normalizeRarity('Galaxy Holo Glitter')).toBe('Unknown');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(normalizeRarity('  rare holo  ')).toBe('Rare Holo');
    expect(normalizeRarity('SECRET RARE')).toBe('Secret Rare');
  });
});

describe('raritySortWeight', () => {
  it('orders Secret > Hyper > Special Illustration > Illustration > Ultra > Double > Holo EX > Holo > Rare > Radiant > Amazing > Promo > Uncommon > Common > Unknown', () => {
    const order = [
      'Rare Secret',
      'Hyper Rare',
      'Special Illustration Rare',
      'Illustration Rare',
      'Ultra Rare',
      'Double Rare',
      'Rare Holo EX',
      'Rare Holo',
      'Rare',
      'Radiant Rare',
      'Amazing Rare',
      'Promo',
      'Uncommon',
      'Common',
      undefined,
    ];
    const weights = order.map((r) => raritySortWeight(r));
    // Strictly decreasing.
    for (let i = 1; i < weights.length; i += 1) {
      expect(weights[i - 1]).toBeGreaterThan(weights[i]);
    }
  });
});

describe('compareRarity', () => {
  it('returns a negative number when a is rarer than b (rarer comes first)', () => {
    // "Rarer first" means rarer rarity should sort BEFORE less rare → result < 0.
    expect(compareRarity('Rare Secret', 'Common')).toBeLessThan(0);
    expect(compareRarity('Common', 'Rare Secret')).toBeGreaterThan(0);
    expect(compareRarity('Rare', 'Rare')).toBe(0);
  });
});

describe('rarityLabel', () => {
  it('returns the Spanish label for the canonical group', () => {
    expect(rarityLabel('Common')).toBe('Común');
    expect(rarityLabel('Uncommon')).toBe('Infrecuente');
    expect(rarityLabel('Rare Holo')).toBe('Rara Holo');
    expect(rarityLabel('Rare Holo EX')).toBe('Rara Holo EX');
    expect(rarityLabel('Radiant Rare')).toBe('Radiante');
    expect(rarityLabel('Amazing Rare')).toBe('Asombrosa');
    expect(rarityLabel(undefined)).toBe('Desconocida');
  });
});

describe('rarityMatchesFilter', () => {
  it('matches everything for the "all" filter, including unknown rarities', () => {
    expect(rarityMatchesFilter('Common', 'all')).toBe(true);
    expect(rarityMatchesFilter(undefined, 'all')).toBe(true);
    expect(rarityMatchesFilter('weird-future-rarity', 'all')).toBe(true);
  });

  it('groups Rare, Rare Holo, Rare Holo EX, Radiant and Amazing under "rare"', () => {
    expect(rarityMatchesFilter('Rare', 'rare')).toBe(true);
    expect(rarityMatchesFilter('Rare Holo', 'rare')).toBe(true);
    expect(rarityMatchesFilter('Rare Holo EX', 'rare')).toBe(true);
    expect(rarityMatchesFilter('Radiant Rare', 'rare')).toBe(true);
    expect(rarityMatchesFilter('Amazing Rare', 'rare')).toBe(true);
    expect(rarityMatchesFilter('Common', 'rare')).toBe(false);
  });

  it('separates Secret-tier rarities into the "secret" filter', () => {
    expect(rarityMatchesFilter('Rare Secret', 'secret')).toBe(true);
    expect(rarityMatchesFilter('Hyper Rare', 'secret')).toBe(true);
    expect(rarityMatchesFilter('Special Illustration Rare', 'secret')).toBe(true);
    expect(rarityMatchesFilter('Rare Holo', 'secret')).toBe(false);
  });
});
