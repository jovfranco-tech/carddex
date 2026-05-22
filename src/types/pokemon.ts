/**
 * Types mirroring the Pokémon TCG API v2 response shape.
 * Reference: https://docs.pokemontcg.io/
 *
 * All fields are optional except `id` — the API does omit many of them per card
 * (especially older cards or promos), so consumers must defensive-check.
 */

export interface CardImages {
  small?: string;
  large?: string;
}

export interface SetImages {
  symbol?: string;
  logo?: string;
}

export interface CardSet {
  id: string;
  name: string;
  series: string;
  printedTotal?: number;
  total?: number;
  legalities?: Record<string, string>;
  ptcgoCode?: string;
  releaseDate?: string;
  updatedAt?: string;
  images?: SetImages;
}

export interface AttackDef {
  name: string;
  cost?: string[];
  convertedEnergyCost?: number;
  damage?: string;
  text?: string;
}

export interface AbilityDef {
  name: string;
  text?: string;
  type?: string;
}

export interface WeaknessOrResistance {
  type: string;
  value: string;
}

export interface TcgPlayerPriceTier {
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  market?: number | null;
  directLow?: number | null;
}

export interface TcgPlayerData {
  url?: string;
  updatedAt?: string;
  prices?: {
    normal?: TcgPlayerPriceTier;
    holofoil?: TcgPlayerPriceTier;
    reverseHolofoil?: TcgPlayerPriceTier;
    '1stEditionHolofoil'?: TcgPlayerPriceTier;
    '1stEditionNormal'?: TcgPlayerPriceTier;
    unlimited?: TcgPlayerPriceTier;
    unlimitedHolofoil?: TcgPlayerPriceTier;
  };
}

export interface CardMarketData {
  url?: string;
  updatedAt?: string;
  prices?: {
    averageSellPrice?: number | null;
    lowPrice?: number | null;
    trendPrice?: number | null;
    germanProLow?: number | null;
    suggestedPrice?: number | null;
    reverseHoloSell?: number | null;
    reverseHoloLow?: number | null;
    reverseHoloTrend?: number | null;
    lowPriceExPlus?: number | null;
    avg1?: number | null;
    avg7?: number | null;
    avg30?: number | null;
  };
}

export interface PokemonCard {
  id: string;
  name: string;
  supertype?: string; // 'Pokémon' | 'Trainer' | 'Energy'
  subtypes?: string[];
  level?: string;
  hp?: string;
  types?: string[];
  evolvesFrom?: string;
  evolvesTo?: string[];
  rules?: string[];
  ancientTrait?: { name: string; text: string };
  abilities?: AbilityDef[];
  attacks?: AttackDef[];
  weaknesses?: WeaknessOrResistance[];
  resistances?: WeaknessOrResistance[];
  retreatCost?: string[];
  convertedRetreatCost?: number;
  set: CardSet;
  number: string;
  artist?: string;
  rarity?: string;
  flavorText?: string;
  nationalPokedexNumbers?: number[];
  legalities?: Record<string, string>;
  regulationMark?: string;
  images: CardImages;
  tcgplayer?: TcgPlayerData;
  cardmarket?: CardMarketData;
  dhash?: string;
}

export interface ApiListResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  count: number;
  totalCount: number;
}

export interface ApiSingleResponse<T> {
  data: T;
}

export interface SearchCardsParams {
  q?: string;
  page?: number;
  pageSize?: number;
  orderBy?: string;
  /** Pokémon name to search for (will be normalized into a `q` query). */
  name?: string;
  /** Filter by set id (e.g. `swsh1`). */
  setId?: string;
  /** Filter by rarity (raw API string, e.g. "Rare Holo"). */
  rarity?: string;
  /** Filter by element type (e.g. "Fire"). */
  type?: string;
  /**
   * When true, skip the remote API and return ONLY results from the offline
   * card catalog and the user's localStorage custom cards.
   */
  localOnly?: boolean;
}
