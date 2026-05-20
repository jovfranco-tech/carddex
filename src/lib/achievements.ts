/**
 * AI-Native Gamification — Achievements System
 *
 * 8 achievements covering the main AI-native and collection flows.
 * State is persisted in localStorage; each achievement is write-once (immutable).
 */

const STORAGE_KEY = 'carddex.achievements.v1';

export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  description: string;
  /** Category of the achievement for grouping in the UI */
  category: 'ai' | 'collection' | 'social';
  /** Optional: percentage progress 0-100 for non-binary achievements */
  progress?: number;
}

/** Full achievement catalogue */
export const ACHIEVEMENT_CATALOGUE: Achievement[] = [
  {
    id: 'first_scan',
    emoji: '📷',
    title: 'Primer Escaneo',
    description: 'Escaneaste tu primera carta con la IA.',
    category: 'ai',
  },
  {
    id: 'fire_collector',
    emoji: '🔥',
    title: 'Coleccionista de Fuego',
    description: 'Posees 5 o más cartas de tipo Fuego en tu binder.',
    category: 'collection',
  },
  {
    id: 'card_grader',
    emoji: '💎',
    title: 'El Evaluador',
    description: 'Usaste el sistema de Grading IA para evaluar 3 cartas.',
    category: 'ai',
  },
  {
    id: 'ai_deck_builder',
    emoji: '🤖',
    title: 'Copiloto de Mazos',
    description: 'Creaste tu primer mazo usando el AI Deck Builder Copilot.',
    category: 'ai',
  },
  {
    id: 'card_creator',
    emoji: '✦',
    title: 'Creador de Cartas',
    description: 'Diseñaste una carta Pokémon única con la IA generativa.',
    category: 'ai',
  },
  {
    id: 'rare_hunter',
    emoji: '🌟',
    title: 'Cazador de Rarezas',
    description: 'Posees al menos 1 carta con rareza Rare Holo o superior.',
    category: 'collection',
  },
  {
    id: 'collector_50',
    emoji: '📦',
    title: 'Coleccionista',
    description: 'Alcanzaste 50 cartas únicas en tu binder digital.',
    category: 'collection',
  },
  {
    id: 'master_collector',
    emoji: '🏆',
    title: 'Maestro Coleccionista',
    description: 'Alcanzaste 200 cartas únicas en tu binder digital.',
    category: 'collection',
  },
];

/** Map from id to definition for O(1) lookups */
export const ACHIEVEMENT_MAP = new Map(ACHIEVEMENT_CATALOGUE.map((a) => [a.id, a]));

/* -------------------------------------------------------------------------- */
/* Persistence helpers                                                         */
/* -------------------------------------------------------------------------- */

export type AchievementRecord = {
  /** ISO timestamp when the achievement was unlocked */
  unlockedAt: string;
};

function load(): Record<string, AchievementRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(data: Record<string, AchievementRecord>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

/** Returns a map of all unlocked achievements. */
export function getUnlockedAchievements(): Record<string, AchievementRecord> {
  return load();
}

/** Returns true if a specific achievement has been unlocked. */
export function isAchievementUnlocked(id: string): boolean {
  return Boolean(load()[id]);
}

/**
 * Unlocks an achievement by ID.
 * Returns the achievement definition if it was newly unlocked, or null if
 * it was already unlocked (idempotent).
 */
export function unlockAchievement(id: string): Achievement | null {
  const data = load();
  if (data[id]) return null; // Already unlocked — no-op

  data[id] = { unlockedAt: new Date().toISOString() };
  save(data);
  return ACHIEVEMENT_MAP.get(id) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Counters stored separately (not in the achievement record itself)          */
/* -------------------------------------------------------------------------- */

const COUNTER_KEY = 'carddex.achv_counters.v1';

function loadCounters(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COUNTER_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCounters(c: Record<string, number>) {
  try {
    localStorage.setItem(COUNTER_KEY, JSON.stringify(c));
  } catch {}
}

export function getCounter(key: string): number {
  return loadCounters()[key] ?? 0;
}

export function incrementCounter(key: string, by = 1): number {
  const c = loadCounters();
  c[key] = (c[key] ?? 0) + by;
  saveCounters(c);
  return c[key];
}

/* -------------------------------------------------------------------------- */
/* Event-based achievement checker                                            */
/* -------------------------------------------------------------------------- */

export type AchievementEvent =
  | { type: 'scan_saved' }
  | { type: 'card_graded' }
  | { type: 'deck_built_with_ai' }
  | { type: 'custom_card_created' }
  | { type: 'collection_updated'; ownedCount: number; hasRareHolo: boolean; fireCardCount: number };

/**
 * Call this whenever a relevant event occurs in the app.
 * Returns an array of newly unlocked achievements (may be empty).
 */
export function processAchievementEvent(event: AchievementEvent): Achievement[] {
  const newlyUnlocked: Achievement[] = [];

  const tryUnlock = (id: string) => {
    const a = unlockAchievement(id);
    if (a) newlyUnlocked.push(a);
  };

  switch (event.type) {
    case 'scan_saved': {
      tryUnlock('first_scan');
      const scans = incrementCounter('scan_count');
      if (scans >= 3) tryUnlock('card_grader');
      break;
    }
    case 'card_graded': {
      const grades = incrementCounter('grade_count');
      if (grades >= 3) tryUnlock('card_grader');
      break;
    }
    case 'deck_built_with_ai': {
      tryUnlock('ai_deck_builder');
      break;
    }
    case 'custom_card_created': {
      tryUnlock('card_creator');
      break;
    }
    case 'collection_updated': {
      const { ownedCount, hasRareHolo, fireCardCount } = event;
      if (hasRareHolo) tryUnlock('rare_hunter');
      if (fireCardCount >= 5) tryUnlock('fire_collector');
      if (ownedCount >= 50) tryUnlock('collector_50');
      if (ownedCount >= 200) tryUnlock('master_collector');
      break;
    }
  }

  return newlyUnlocked;
}
