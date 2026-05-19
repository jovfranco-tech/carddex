import { describe, expect, it } from 'vitest';
import type { PokemonCard } from '@/types/pokemon';
import {
  formatCollectionValue,
  formatCurrencyTotal,
  formatPrice,
  formatPriceShort,
  getEstimatedPrice,
  sumCollectionValue,
} from './pricing';

/** Minimal PokemonCard factory — only fills the fields pricing.ts looks at. */
function makeCard(
  prices: {
    tcg?: NonNullable<NonNullable<PokemonCard['tcgplayer']>['prices']>;
    cm?: NonNullable<NonNullable<PokemonCard['cardmarket']>['prices']>;
  } = {},
  id = 'card-1',
): PokemonCard {
  return {
    id,
    name: 'Test Card',
    images: {},
    number: '1',
    set: { id: 'set1', name: 'Test Set', series: 'Test' },
    tcgplayer: prices.tcg ? { prices: prices.tcg } : undefined,
    cardmarket: prices.cm ? { prices: prices.cm } : undefined,
  };
}

describe('getEstimatedPrice waterfall', () => {
  it('returns null when there is no price data', () => {
    expect(getEstimatedPrice(makeCard())).toBeNull();
    expect(getEstimatedPrice(null)).toBeNull();
    expect(getEstimatedPrice(undefined)).toBeNull();
  });

  it('prefers holofoil over every other tcgplayer tier', () => {
    const card = makeCard({
      tcg: {
        holofoil: { market: 12 },
        reverseHolofoil: { market: 9 },
        normal: { market: 4 },
      },
    });
    const p = getEstimatedPrice(card);
    expect(p).not.toBeNull();
    expect(p!.value).toBe(12);
    expect(p!.currency).toBe('USD');
    expect(p!.provider).toBe('tcgplayer');
    expect(p!.tier).toBe('holofoil');
  });

  it('falls back to reverseHolofoil when holofoil is missing', () => {
    const card = makeCard({
      tcg: { reverseHolofoil: { market: 7 }, normal: { market: 2 } },
    });
    expect(getEstimatedPrice(card)!.tier).toBe('reverseHolofoil');
  });

  it('falls back to normal when only normal is published', () => {
    const card = makeCard({ tcg: { normal: { market: 3.5 } } });
    expect(getEstimatedPrice(card)!.tier).toBe('normal');
  });

  it('falls back to 1st-edition tiers when others are absent', () => {
    const card = makeCard({
      tcg: { '1stEditionHolofoil': { market: 25 } },
    });
    expect(getEstimatedPrice(card)!.tier).toBe('1stEditionHolofoil');
  });

  it('falls back to Cardmarket averageSellPrice and reports EUR', () => {
    const card = makeCard({ cm: { averageSellPrice: 6.5 } });
    const p = getEstimatedPrice(card)!;
    expect(p.currency).toBe('EUR');
    expect(p.provider).toBe('cardmarket');
    expect(p.tier).toBe('averageSellPrice');
  });

  it('falls back to Cardmarket trendPrice when averageSellPrice is missing', () => {
    const card = makeCard({ cm: { trendPrice: 4.2 } });
    expect(getEstimatedPrice(card)!.tier).toBe('trendPrice');
  });

  it('treats zero, NaN and null as no price (no fake $0.00)', () => {
    const zero = makeCard({ tcg: { holofoil: { market: 0 }, normal: { market: 0 } } });
    expect(getEstimatedPrice(zero)).toBeNull();

    const nan = makeCard({ tcg: { holofoil: { market: NaN } } });
    expect(getEstimatedPrice(nan)).toBeNull();

    const nul = makeCard({ tcg: { holofoil: { market: null } } });
    expect(getEstimatedPrice(nul)).toBeNull();
  });
});

describe('formatters', () => {
  it('formatPrice respects the price currency', () => {
    const usd = formatPrice({
      value: 12,
      currency: 'USD',
      source: 'TCGPlayer',
      provider: 'tcgplayer',
      tier: 'holofoil',
    });
    expect(usd).toContain('12.00');

    const eur = formatPrice({
      value: 12,
      currency: 'EUR',
      source: 'Cardmarket',
      provider: 'cardmarket',
      tier: 'averageSellPrice',
    });
    // es-ES uses comma as decimal sep, may produce e.g. "12,00 €".
    expect(eur).toMatch(/12[,.]00/);
    expect(eur).toContain('€');
  });

  it('formatPrice returns "Sin precio" for null', () => {
    expect(formatPrice(null)).toBe('Sin precio');
  });

  it('formatPriceShort uses k/M for big numbers and 2 decimals otherwise', () => {
    expect(
      formatPriceShort({
        value: 12,
        currency: 'USD',
        source: 's',
        provider: 'tcgplayer',
        tier: 'normal',
      }),
    ).toBe('$12.00');
    expect(
      formatPriceShort({
        value: 12345,
        currency: 'USD',
        source: 's',
        provider: 'tcgplayer',
        tier: 'normal',
      }),
    ).toMatch(/^\$\d+\.\dk$/);
    expect(formatPriceShort(null)).toBe('—');
  });

  it('formatCurrencyTotal collapses zero/negative to an em-dash', () => {
    expect(formatCurrencyTotal(0, 'USD')).toBe('—');
    expect(formatCurrencyTotal(-1, 'USD')).toBe('—');
    expect(formatCurrencyTotal(3.5, 'USD')).toContain('3.50');
  });

  it('formatCollectionValue picks the right shape based on which currencies are present', () => {
    expect(formatCollectionValue({ usd: 0, eur: 0 })).toBe('—');
    expect(formatCollectionValue({ usd: 5, eur: 0 })).toContain('5.00');
    expect(formatCollectionValue({ usd: 0, eur: 5 })).toContain('€');
    const both = formatCollectionValue({ usd: 5, eur: 5 });
    expect(both).toContain('$');
    expect(both).toContain('€');
    expect(both).toContain('·');
  });
});

describe('sumCollectionValue', () => {
  const usdCard = makeCard({ tcg: { holofoil: { market: 10 } } }, 'a');
  const eurCard = makeCard({ cm: { averageSellPrice: 5 } }, 'b');
  const unpriced = makeCard({}, 'c');

  it('multiplies value by quantity and groups by currency', () => {
    const totals = sumCollectionValue([
      { card: usdCard, quantity: 3 },
      { card: eurCard, quantity: 2 },
    ]);
    expect(totals.usd).toBe(30);
    expect(totals.eur).toBe(10);
    expect(totals.cardsWithPrice).toBe(2);
  });

  it('ignores zero-quantity rows and unpriced cards', () => {
    const totals = sumCollectionValue([
      { card: usdCard, quantity: 0 },
      { card: unpriced, quantity: 5 },
      { card: usdCard, quantity: 1 },
    ]);
    expect(totals.usd).toBe(10);
    expect(totals.cardsWithPrice).toBe(1);
  });

  it('returns zeroed totals when given an empty list', () => {
    expect(sumCollectionValue([])).toEqual({ usd: 0, eur: 0, cardsWithPrice: 0 });
  });
});
