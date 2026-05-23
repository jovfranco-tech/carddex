import type { PokemonCard } from '@/types/pokemon';
import { cleanLuceneQueryForLocalSearch } from '@/lib/pokemonTcgApi';

export type SortKey = 'rarity' | 'value' | 'name' | 'recent';

export const SORT_LABELS: Record<SortKey, string> = {
  rarity: 'Rareza',
  value: 'Valor',
  name: 'Nombre',
  recent: 'Recientes',
};

export interface AdvancedFilters {
  name?: string;
  types: string[];
  hpMin?: number;
  hpMax?: number;
  rarities: string[];
}

export function mapTypeToEnglish(t: string): string {
  switch (t) {
    case 'fuego':
      return 'fire';
    case 'agua':
      return 'water';
    case 'planta':
      return 'grass';
    case 'rayo':
    case 'eléctrico':
    case 'electrico':
      return 'lightning';
    case 'psíquico':
    case 'psiquico':
      return 'psychic';
    case 'lucha':
      return 'fighting';
    case 'oscuridad':
    case 'siniestro':
      return 'darkness';
    case 'metal':
    case 'acero':
      return 'metal';
    case 'dragón':
    case 'dragon':
      return 'dragon';
    case 'incoloro':
      return 'colorless';
    case 'hada':
      return 'fairy';
    default:
      return t;
  }
}

export function mapRarityToEnglish(r: string): string {
  switch (r) {
    case 'común':
    case 'comun':
      return 'common';
    case 'infrecuente':
      return 'uncommon';
    case 'rara':
      return 'rare';
    case 'secreta':
    case 'secreto':
      return 'secret';
    default:
      return r;
  }
}

export function parseAdvancedQuery(query: string): AdvancedFilters {
  const parts = query.split(/\s+/);
  const filters: AdvancedFilters = {
    types: [],
    rarities: [],
  };

  const nameParts: string[] = [];

  parts.forEach((part) => {
    if (!part) return;

    if (part.startsWith('t:') || part.startsWith('tipo:') || part.startsWith('type:')) {
      const val = part.split(':')[1]?.toLowerCase();
      if (val) filters.types.push(val);
    } else if (part.startsWith('r:') || part.startsWith('rareza:') || part.startsWith('rarity:')) {
      const val = part.split(':')[1]?.toLowerCase();
      if (val) filters.rarities.push(val);
    } else if (part.startsWith('hp>')) {
      const val = parseInt(part.substring(3), 10);
      if (!isNaN(val)) filters.hpMin = val;
    } else if (part.startsWith('hp<')) {
      const val = parseInt(part.substring(3), 10);
      if (!isNaN(val)) filters.hpMax = val;
    } else if (part.startsWith('hp=')) {
      const val = parseInt(part.substring(3), 10);
      if (!isNaN(val)) {
        filters.hpMin = val;
        filters.hpMax = val;
      }
    } else {
      nameParts.push(part);
    }
  });

  if (nameParts.length > 0) {
    filters.name = nameParts.join(' ').toLowerCase();
  }

  return filters;
}

export function matchesAdvancedFilters(c: PokemonCard, f: AdvancedFilters): boolean {
  if (f.name) {
    const cleanCardName = c.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Clean the Lucene query terms for robust clientside matching
    const cleanSearchQueryRaw = cleanLuceneQueryForLocalSearch(f.name);
    const cleanSearchQuery = cleanSearchQueryRaw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const queryWords = cleanSearchQuery.split(' ').filter(Boolean);
    const wordMatch =
      queryWords.length === 0 || queryWords.every((word) => cleanCardName.includes(word));

    const numMatch = c.number?.toLowerCase().includes(f.name);
    const setMatch =
      c.set?.name?.toLowerCase().includes(f.name) || c.set?.id?.toLowerCase().includes(f.name);

    if (!wordMatch && !numMatch && !setMatch) return false;
  }

  if (f.types.length > 0) {
    const cardTypes = (c.types || []).map((t) => t.toLowerCase());
    const supertype = c.supertype?.toLowerCase() || '';
    const subtype = (c.subtypes || []).map((s) => s.toLowerCase());

    const match = f.types.some((t) => {
      const englishType = mapTypeToEnglish(t);
      return (
        cardTypes.includes(englishType) ||
        cardTypes.includes(t) ||
        supertype.includes(t) ||
        subtype.includes(t)
      );
    });
    if (!match) return false;
  }

  if (f.rarities.length > 0) {
    const cardRarity = c.rarity?.toLowerCase() || '';
    const match = f.rarities.some((r) => {
      const englishRarity = mapRarityToEnglish(r);
      return cardRarity.includes(englishRarity) || cardRarity.includes(r);
    });
    if (!match) return false;
  }

  if (f.hpMin !== undefined || f.hpMax !== undefined) {
    const hpVal = parseInt(c.hp || '', 10);
    if (isNaN(hpVal)) return false;
    if (f.hpMin !== undefined && hpVal < f.hpMin) return false;
    if (f.hpMax !== undefined && hpVal > f.hpMax) return false;
  }

  return true;
}

export const SEARCH_SUGGESTIONS = [
  { label: '🔥 Fuego', value: 'tipo:fuego' },
  { label: '💧 Agua', value: 'tipo:agua' },
  { label: '🌿 Planta', value: 'tipo:planta' },
  { label: '⚡ Rayo', value: 'tipo:rayo' },
  { label: '👁️ Psíquico', value: 'tipo:psiquico' },
  { label: '✊ Lucha', value: 'tipo:lucha' },
  { label: '⭐ Incoloro', value: 'tipo:incoloro' },
  { label: '❤️ HP > 120', value: 'hp>120' },
  { label: '❤️ HP > 200', value: 'hp>200' },
  { label: '✨ Raras', value: 'rareza:rare' },
  { label: '🌟 Secretas', value: 'rareza:secret' },
];

export function base64ToFile(base64: string, filename: string): File {
  const arr = base64.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}
