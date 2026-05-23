import type { PokemonCard } from '@/types/pokemon';

export type Currency = 'USD' | 'EUR' | 'MXN';

const exchangeRates = { USD: 17.5, EUR: 19.0 }; // Fallback rough rates
try {
  fetch('https://open.er-api.com/v6/latest/MXN')
    .then((res) => res.json())
    .then((data) => {
      if (data.rates?.USD && data.rates?.EUR) {
        exchangeRates.USD = 1 / data.rates.USD;
        exchangeRates.EUR = 1 / data.rates.EUR;
      }
    })
    .catch(() => {});
} catch {}

export function prefersMXN(): boolean {
  try {
    return localStorage.getItem('carddex_pref_mxn') === 'true';
  } catch {
    return false;
  }
}

export function setPrefersMXN(val: boolean): void {
  try {
    localStorage.setItem('carddex_pref_mxn', String(val));
  } catch {}
}

export interface EstimatedPrice {
  value: number;
  currency: Currency;
  /** Short human-readable source label, e.g. "TCGPlayer · Holofoil". */
  source: string;
  /** Provider identifier for grouping / iconography. */
  provider: 'tcgplayer' | 'cardmarket';
  /** Specific price tier key (holofoil, reverseHolofoil, …). */
  tier: string;
}

/**
 * Standard disclaimer copy used wherever we surface an estimated value. The
 * exact wording stays consistent across screens so the user learns the meaning.
 */
export const PRICE_DISCLAIMER =
  'Valor estimado basado en datos disponibles de mercado. Puede variar por idioma, condición, edición y demanda.';

/**
 * Pick the best available "market" price for a card following the requested
 * waterfall:
 *   1. tcgplayer.prices.holofoil.market
 *   2. tcgplayer.prices.reverseHolofoil.market
 *   3. tcgplayer.prices.normal.market
 *   4. tcgplayer.prices.1stEditionHolofoil.market
 *   5. tcgplayer.prices.1stEditionNormal.market
 *   6. cardmarket.prices.averageSellPrice
 *   7. cardmarket.prices.trendPrice
 *   8. null
 *
 * Returns `null` when no usable price is published — the UI should then show
 * "Sin precio" rather than fake $0.00.
 */
export function getEstimatedPrice(card?: PokemonCard | null): EstimatedPrice | null {
  if (!card) return null;
  const tp = card.tcgplayer?.prices;
  const cm = card.cardmarket?.prices;

  const pickTcg = (
    value: number | null | undefined,
    tier: string,
    label: string
  ): EstimatedPrice | null => {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) return null;
    return {
      value,
      currency: 'USD',
      provider: 'tcgplayer',
      tier,
      source: `TCGPlayer · ${label}`,
    };
  };

  const pickCm = (
    value: number | null | undefined,
    tier: string,
    label: string
  ): EstimatedPrice | null => {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) return null;
    return {
      value,
      currency: 'EUR',
      provider: 'cardmarket',
      tier,
      source: `Cardmarket · ${label}`,
    };
  };

  return (
    pickTcg(tp?.holofoil?.market, 'holofoil', 'Holofoil') ??
    pickTcg(tp?.reverseHolofoil?.market, 'reverseHolofoil', 'Reverse Holo') ??
    pickTcg(tp?.normal?.market, 'normal', 'Normal') ??
    pickTcg(tp?.['1stEditionHolofoil']?.market, '1stEditionHolofoil', '1ª Ed. Holo') ??
    pickTcg(tp?.['1stEditionNormal']?.market, '1stEditionNormal', '1ª Ed.') ??
    pickTcg(tp?.unlimitedHolofoil?.market, 'unlimitedHolofoil', 'Unlimited Holo') ??
    pickTcg(tp?.unlimited?.market, 'unlimited', 'Unlimited') ??
    pickCm(cm?.averageSellPrice, 'averageSellPrice', 'Venta media') ??
    pickCm(cm?.trendPrice, 'trendPrice', 'Tendencia') ??
    null
  );
}

/** Format a price with the proper currency symbol and locale. */
export function formatPrice(price: EstimatedPrice | null, forceOriginal = false): string {
  if (!price) return 'Sin precio';

  let val = price.value;
  let curr = price.currency;

  if (!forceOriginal && prefersMXN()) {
    curr = 'MXN';
    val = price.value * (price.currency === 'USD' ? exchangeRates.USD : exchangeRates.EUR);
  }

  const fmt = new Intl.NumberFormat(curr === 'EUR' ? 'es-ES' : 'es-MX', {
    style: 'currency',
    currency: curr,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  return fmt.format(val);
}

/** Compact formatter — drops decimals on values >= 1000, uses k/M suffixes. */
export function formatPriceShort(price: EstimatedPrice | null): string {
  if (!price) return '—';

  let val = price.value;
  let curr = price.currency;

  if (prefersMXN()) {
    curr = 'MXN';
    val = price.value * (price.currency === 'USD' ? exchangeRates.USD : exchangeRates.EUR);
  }

  const symbol = curr === 'EUR' ? '€' : '$';
  const suffix = curr === 'MXN' ? ' MXN' : '';
  const v = val;
  if (v >= 1_000_000) return `${symbol}${(v / 1_000_000).toFixed(1)}M${suffix}`;
  if (v >= 10_000) return `${symbol}${(v / 1000).toFixed(1)}k${suffix}`;
  return `${symbol}${v.toFixed(2)}${suffix}`;
}

/** Format a bare currency total (no card lookup needed). */
export function formatCurrencyTotal(value: number, currency: Currency): string {
  if (!isFinite(value) || value <= 0) return '—';
  const fmt = new Intl.NumberFormat(currency === 'EUR' ? 'es-ES' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  return fmt.format(value);
}

/** Sum of estimated values for a list of owned cards, grouped by currency. */
export function sumCollectionValue(cards: Array<{ card: PokemonCard; quantity: number }>): {
  usd: number;
  eur: number;
  cardsWithPrice: number;
} {
  let usd = 0;
  let eur = 0;
  let cardsWithPrice = 0;
  for (const { card, quantity } of cards) {
    const p = getEstimatedPrice(card);
    if (!p) continue;
    const qty = Math.max(0, quantity);
    if (qty === 0) continue;
    cardsWithPrice += 1;
    const subtotal = p.value * qty;
    if (p.currency === 'USD') usd += subtotal;
    else eur += subtotal;
  }
  return { usd, eur, cardsWithPrice };
}

/**
 * Render a compact summary line for a mixed-currency total.
 * Examples:
 *   "$120.45"
 *   "€45.10"
 *   "$120.45 · €45.10"
 *   "—"
 */
export function formatCollectionValue(totals: { usd: number; eur: number }): string {
  if (prefersMXN()) {
    const mxnTotal = totals.usd * exchangeRates.USD + totals.eur * exchangeRates.EUR;
    if (mxnTotal > 0) return formatCurrencyTotal(mxnTotal, 'MXN') + ' MXN';
    return '—';
  }

  const parts: string[] = [];
  if (totals.usd > 0) parts.push(formatCurrencyTotal(totals.usd, 'USD'));
  if (totals.eur > 0) parts.push(formatCurrencyTotal(totals.eur, 'EUR'));
  return parts.length === 0 ? '—' : parts.join(' · ');
}
