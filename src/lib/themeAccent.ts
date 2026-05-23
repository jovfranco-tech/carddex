/**
 * System theme accent customization utility.
 * Defines 5 premium HSL accent colors for CardDex:
 * 1. Electric Blue (Original)
 * 2. Fire Orange (Charizard-inspired)
 * 3. Grass Green (Venusaur-inspired)
 * 4. Lightning Yellow (Pikachu-inspired)
 * 5. Psychic Pink (Mew-inspired)
 */

export interface ThemeAccent {
  id: string;
  name: string;
  emoji: string;
  accent: string;
  accentDark: string;
  accentTint: string;
}

export const THEME_ACCENTS: ThemeAccent[] = [
  {
    id: 'electric-blue',
    name: 'Azul Eléctrico',
    emoji: '⚡',
    accent: '#2F6FE0',
    accentDark: '#1E4DA1',
    accentTint: 'rgba(47, 111, 224, 0.10)',
  },
  {
    id: 'fire-orange',
    name: 'Naranja Fuego',
    emoji: '🔥',
    accent: '#FF5E13',
    accentDark: '#C53E00',
    accentTint: 'rgba(255, 94, 19, 0.10)',
  },
  {
    id: 'grass-green',
    name: 'Verde Planta',
    emoji: '🌿',
    accent: '#10B981',
    accentDark: '#047857',
    accentTint: 'rgba(16, 185, 129, 0.10)',
  },
  {
    id: 'lightning-yellow',
    name: 'Amarillo Rayo',
    emoji: '👑',
    accent: '#FBBF24',
    accentDark: '#D97706',
    accentTint: 'rgba(251, 191, 36, 0.12)',
  },
  {
    id: 'psychic-pink',
    name: 'Rosa Psíquico',
    emoji: '🔮',
    accent: '#EC4899',
    accentDark: '#BE185D',
    accentTint: 'rgba(236, 72, 153, 0.10)',
  },
];

const STORAGE_KEY = 'carddex_theme_accent';

/**
 * Applies a theme accent to the document root variables on the fly.
 */
export function applyThemeAccent(id: string): void {
  const accent = THEME_ACCENTS.find((t) => t.id === id) || THEME_ACCENTS[0];
  const root = document.documentElement;
  root.style.setProperty('--accent', accent.accent);
  root.style.setProperty('--accent-dark', accent.accentDark);
  root.style.setProperty('--accent-tint', accent.accentTint);
  localStorage.setItem(STORAGE_KEY, id);
}

/**
 * Gets the current applied theme accent.
 */
export function getAppliedThemeAccent(): ThemeAccent {
  const stored = localStorage.getItem(STORAGE_KEY);
  return THEME_ACCENTS.find((t) => t.id === stored) || THEME_ACCENTS[0];
}

/**
 * Initializes the theme accent on application boot.
 */
export function initThemeAccent(): void {
  const active = getAppliedThemeAccent();
  applyThemeAccent(active.id);
}
