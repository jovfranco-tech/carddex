/**
 * Rarity normalization, labels, sort order and palette.
 *
 * The Pokémon TCG API returns free-form rarity strings (more than 30 distinct
 * values across the catalog, growing over time). This file normalizes them
 * into a smaller, stable set of UI groups, gives each group a Spanish label,
 * a sort weight (higher = rarer/more important) and a color used by
 * `RarityBadge`.
 */

export type RarityGroup =
  | 'Common'
  | 'Uncommon'
  | 'Rare'
  | 'Rare Holo'
  | 'Rare Holo EX'
  | 'Double Rare'
  | 'Ultra Rare'
  | 'Illustration Rare'
  | 'Special Illustration Rare'
  | 'Hyper Rare'
  | 'Secret Rare'
  | 'Amazing Rare'
  | 'Radiant Rare'
  | 'Promo'
  | 'Unknown';

export const RARITY_LABELS_ES: Record<RarityGroup, string> = {
  Common: 'Común',
  Uncommon: 'Infrecuente',
  Rare: 'Rara',
  'Rare Holo': 'Rara Holo',
  'Rare Holo EX': 'Rara Holo EX',
  'Double Rare': 'Doble rara',
  'Ultra Rare': 'Ultra rara',
  'Illustration Rare': 'Ilustración rara',
  'Special Illustration Rare': 'Ilustración especial',
  'Hyper Rare': 'Hiper rara',
  'Secret Rare': 'Secreta',
  'Amazing Rare': 'Asombrosa',
  'Radiant Rare': 'Radiante',
  Promo: 'Promo',
  Unknown: 'Desconocida',
};

/**
 * Sort weight: higher = rarer (sorts first in "rarest first" listings).
 * Order:
 *   Secret > Hyper > Special Illustration > Illustration > Ultra > Double Rare
 *     > Rare Holo EX > Rare Holo > Rare > Radiant > Amazing > Promo
 *     > Uncommon > Common > Unknown
 */
const SORT_WEIGHT: Record<RarityGroup, number> = {
  'Secret Rare': 100,
  'Hyper Rare': 95,
  'Special Illustration Rare': 92,
  'Illustration Rare': 88,
  'Ultra Rare': 82,
  'Double Rare': 78,
  'Rare Holo EX': 74,
  'Rare Holo': 70,
  Rare: 60,
  'Radiant Rare': 55,
  'Amazing Rare': 52,
  Promo: 30,
  Uncommon: 20,
  Common: 10,
  Unknown: 0,
};

const COLOR_BY_GROUP: Record<RarityGroup, string> = {
  Common: '#8E8E93',
  Uncommon: '#34C759',
  Rare: '#2F80ED',
  'Rare Holo': '#3FA9F5',
  'Rare Holo EX': '#5563DE',
  'Double Rare': '#FFC107',
  'Ultra Rare': '#7B5AD9',
  'Illustration Rare': '#F2994A',
  'Special Illustration Rare': '#D363B9',
  'Hyper Rare': '#FF6B61',
  'Secret Rare': '#FF3B30',
  'Amazing Rare': '#FF8FAB',
  'Radiant Rare': '#19C2BB',
  Promo: '#0EA5A1',
  Unknown: '#9098A6',
};

const ICON_BY_GROUP: Record<RarityGroup, string> = {
  Common: '●',
  Uncommon: '◆',
  Rare: '★',
  'Rare Holo': '★',
  'Rare Holo EX': '★',
  'Double Rare': '★★',
  'Ultra Rare': '✦',
  'Illustration Rare': '✺',
  'Special Illustration Rare': '✺',
  'Hyper Rare': '✸',
  'Secret Rare': '✺',
  'Amazing Rare': '✶',
  'Radiant Rare': '☼',
  Promo: '⬢',
  Unknown: '●',
};

/* ------------------------------------------------------------------------- */

/** Top-level filter groups exposed in the UI (chip row, dropdown, etc.). */
export const RARITY_FILTERS: ReadonlyArray<{
  key: string;
  label: string;
  groups: RarityGroup[];
}> = [
  { key: 'all', label: 'Todas', groups: [] },
  { key: 'common', label: 'Comunes', groups: ['Common'] },
  { key: 'uncommon', label: 'Infrecuentes', groups: ['Uncommon'] },
  {
    key: 'rare',
    label: 'Raras',
    groups: ['Rare', 'Rare Holo', 'Rare Holo EX', 'Radiant Rare', 'Amazing Rare'],
  },
  {
    key: 'ultra',
    label: 'Ultra raras',
    groups: ['Ultra Rare', 'Double Rare', 'Illustration Rare'],
  },
  {
    key: 'secret',
    label: 'Secretas',
    groups: ['Secret Rare', 'Hyper Rare', 'Special Illustration Rare'],
  },
  {
    key: 'promo',
    label: 'Promos',
    groups: ['Promo'],
  },
];

/* ------------------------------------------------------------------------- */
/* Normalization                                                              */
/* ------------------------------------------------------------------------- */

/**
 * Map a raw API rarity string into a stable UI group.
 *
 * The order of the checks below matters — more specific patterns are checked
 * before more general ones (e.g. "special illustration" before "illustration",
 * "rare holo ex" before "rare holo", "rare ace" before plain "rare").
 */
export function normalizeRarity(raw?: string | null): RarityGroup {
  if (!raw) return 'Unknown';
  const s = raw.trim().toLowerCase();
  if (!s) return 'Unknown';

  // Promo first (covers "Promo", "Rare Promo", "Classic Collection Promo", etc.)
  if (s === 'promo' || s.includes('promo')) return 'Promo';

  // Illustration variants
  if (s.includes('special illustration')) return 'Special Illustration Rare';
  if (s.includes('illustration rare') || s.includes('illustration art')) {
    return 'Illustration Rare';
  }

  // Hyper / Secret family
  if (s.includes('hyper')) return 'Hyper Rare';
  if (
    s.includes('secret') ||
    s.includes('rainbow') ||
    s.includes('rare shiny') ||
    s.includes('shiny rare')
  ) {
    return 'Secret Rare';
  }

  // Radiant & Amazing — distinct one-off rarities
  if (s.includes('radiant')) return 'Radiant Rare';
  if (s.includes('amazing')) return 'Amazing Rare';

  // Modern "Double Rare" (Scarlet & Violet era ex cards)
  if (s.includes('double rare')) return 'Double Rare';

  // Ultra family — explicit "ultra rare" + legacy ultra-class subtypes
  if (s.includes('ultra')) return 'Ultra Rare';
  if (
    s.includes('vmax') ||
    s.includes('vstar') ||
    s.includes('rare break') ||
    s.includes('rare shining') ||
    s.includes('rare ace') ||
    s.includes('rare prime') ||
    s.includes('legend')
  ) {
    return 'Ultra Rare';
  }
  // GX / V class is ultra rare. Check word-boundary-ish endings so this
  // catches "Rare Holo GX" / "Rare Holo V" (the API publishes both forms)
  // without falsely matching a 'v' anywhere inside another word.
  if (/(^|\s)gx$/.test(s) || /(^|\s)v$/.test(s)) return 'Ultra Rare';
  if (s.endsWith(' v-union') || s.endsWith(' v union')) return 'Ultra Rare';

  // Holo EX — modern "ex" suffix + classic EX cards. Treat ' ex' as a
  // suffix-ish marker, not "appears anywhere".
  if (s.includes('rare holo ex') || s === 'rare ex' || /(^|\s)ex$/.test(s)) {
    return 'Rare Holo EX';
  }

  // Generic holo — require the string to look like a real Pokémon TCG
  // "rare holo" rarity, not just any text containing "holo".
  if (s === 'rare holo' || s.startsWith('rare holo')) return 'Rare Holo';
  if (s === 'holo') return 'Rare Holo';

  // Plain rare last so it doesn't shadow the above
  if (s === 'rare' || s.startsWith('rare ')) return 'Rare';

  // Bottom of the ladder
  if (s === 'common') return 'Common';
  if (s === 'uncommon') return 'Uncommon';

  return 'Unknown';
}

export function rarityLabel(raw?: string | null): string {
  return RARITY_LABELS_ES[normalizeRarity(raw)];
}

export function rarityColor(raw?: string | null): string {
  return COLOR_BY_GROUP[normalizeRarity(raw)];
}

export function rarityIcon(raw?: string | null): string {
  return ICON_BY_GROUP[normalizeRarity(raw)];
}

export function raritySortWeight(raw?: string | null): number {
  return SORT_WEIGHT[normalizeRarity(raw)];
}

/**
 * Compare two rarity strings. Returns positive if `b` is rarer than `a`.
 * Default behaviour pushes rarer cards first.
 */
export function compareRarity(a?: string | null, b?: string | null): number {
  return raritySortWeight(b) - raritySortWeight(a);
}

/** Check if a rarity matches one of the chip filters defined above. */
export function rarityMatchesFilter(raw: string | null | undefined, filterKey: string): boolean {
  if (filterKey === 'all') return true;
  const filter = RARITY_FILTERS.find((f) => f.key === filterKey);
  if (!filter) return true;
  const group = normalizeRarity(raw);
  return filter.groups.includes(group);
}
