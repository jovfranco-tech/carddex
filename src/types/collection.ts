/**
 * Local collection metadata, persisted in LocalStorage.
 * We never duplicate Pokémon TCG API content — we only remember the cardId and the
 * user-specific facets (owned/qty/condition/etc.). The card content is fetched on demand.
 */

export type CardCondition =
  | 'Mint'
  | 'Near Mint'
  | 'Lightly Played'
  | 'Moderately Played'
  | 'Heavily Played'
  | 'Damaged';

export type CardVariant = 'Normal' | 'Holo' | 'Reverse Holo' | 'Promo';

export type WishlistPriority = 'Low' | 'Medium' | 'High' | 'Grail';

export interface CollectionCardMeta {
  cardId: string;
  owned: boolean;
  quantity: number;
  condition: CardCondition;
  variant: CardVariant;
  foil: boolean;
  favorite: boolean;
  wishlist: boolean;
  missing: boolean;
  notes?: string;
  priority?: WishlistPriority;
  /** ISO 639-1 code or free-form label (e.g. "EN", "ES", "JP"). */
  language?: string;
  customGrade?: number;
  customGradeReport?: string;
  addedAt: string;
  updatedAt: string;
}

export interface CollectionState {
  version: 1;
  cards: Record<string, CollectionCardMeta>;
}

export interface RecentlyViewedEntry {
  cardId: string;
  viewedAt: string;
}

export interface AppSettings {
  version: 1;
  /** When true the app has been opened at least once. */
  hasOnboarded: boolean;
}

export const DEFAULT_COLLECTION: CollectionState = {
  version: 1,
  cards: {},
};

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  hasOnboarded: false,
};

export function makeDefaultMeta(cardId: string): CollectionCardMeta {
  const now = new Date().toISOString();
  return {
    cardId,
    owned: true,
    quantity: 1,
    condition: 'Near Mint',
    variant: 'Normal',
    foil: false,
    favorite: false,
    wishlist: false,
    missing: false,
    language: 'EN',
    addedAt: now,
    updatedAt: now,
  };
}
