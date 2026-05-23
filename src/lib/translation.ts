/**
 * Pokémon TCG Dynamic Translation Engine
 * Localizes attacks, abilities, rules, and card text from English to Spanish
 * using standard official Spanish TCG terminology.
 */

// Dictionary mapping direct keywords and terms
const VOCABULARY: Record<string, string> = {
  // Card Types & Stages
  Basic: 'Básico',
  'Stage 1': 'Fase 1',
  'Stage 2': 'Fase 2',
  VMAX: 'VMAX',
  VSTAR: 'VSTAR',
  MEGA: 'MEGA',
  Restored: 'Restaurado',
  ITEM: 'Objeto',
  SUPPORTER: 'Partidario',
  STADIUM: 'Estadio',
  'POKEMON TOOL': 'Herramienta Pokémon',
  'SPECIAL ENERGY': 'Energía Especial',

  // Status Conditions
  Asleep: 'Dormido',
  Burned: 'Quemado',
  Confused: 'Confundido',
  Paralyzed: 'Paralizado',
  Poisoned: 'Envenenado',

  // Mechanics / Zones
  'Active Pokémon': 'Pokémon Activo',
  Active: 'Activo',
  Bench: 'Banca',
  Benched: 'en la Banca',
  'Discard Pile': 'Pila de Descarte',
  'Prize Card': 'Carta de Premio',
  'Prize Cards': 'Cartas de Premio',
  Deck: 'Baraja',
  Hand: 'Mano',
  'Lost Zone': 'Zona Perdida',
  Weakness: 'Debilidad',
  Resistance: 'Resistencia',
  'Retreat Cost': 'Coste de Retirada',
  Retreat: 'Retirada',
  Ability: 'Habilidad',
  Abilities: 'Habilidades',
  Attack: 'Ataque',
  Attacks: 'Ataques',
  Rule: 'Regla',
};

// Regex replacements for dynamic sentence structures, ordered by specificity (most specific first)
const TRANSLATION_RULES: {
  pattern: RegExp;
  replacement: string | ((match: string, ...args: any[]) => string);
}[] = [
  // 1. Long / Complex / Specific sentences first
  {
    pattern: /Discard your hand and draw (\d+) cards\./gi,
    replacement: 'Descarta tu mano y roba $1 cartas.',
  },
  {
    pattern:
      /Flip a coin\. If heads, prevent all damage done to this Pokémon during your opponent's next turn\./gi,
    replacement:
      'Lanza una moneda. Si sale cara, evita todo el daño infligido a este Pokémon durante el próximo turno de tu oponente.',
  },
  {
    pattern: /If heads, this attack does (\d+) more damage\./gi,
    replacement: 'Si sale cara, este ataque hace $1 puntos de daño más.',
  },
  {
    pattern: /If heads, the Active Pokémon is now ([a-zA-Z]+)\./gi,
    replacement: (match, status) => {
      const spanishStatus = VOCABULARY[status] || status;
      return `Si sale cara, el Pokémon Activo pasa a estar ${spanishStatus.toLowerCase()}.`;
    },
  },

  // 2. Specific damage rules
  {
    pattern: /This attack does (\d+) damage to each of your opponent's Benched Pokémon\./gi,
    replacement:
      'Este ataque hace $1 puntos de daño a cada uno de los Pokémon en la Banca de tu oponente.',
  },
  {
    pattern: /This attack also does (\d+) damage to each of your opponent's Benched Pokémon\./gi,
    replacement:
      'Este ataque también hace $1 puntos de daño a cada uno de los Pokémon en la Banca de tu oponente.',
  },
  {
    pattern: /does (\d+) damage to each of your opponent's Benched Pokémon\./gi,
    replacement: 'hace $1 puntos de daño a cada uno de los Pokémon en la Banca de tu oponente.',
  },
  {
    pattern: /This attack does (\d+) damage to/gi,
    replacement: 'Este ataque hace $1 puntos de daño a',
  },
  {
    pattern: /This attack also does (\d+) damage to/gi,
    replacement: 'Este ataque también hace $1 puntos de daño a',
  },
  {
    pattern: /This attack does (\d+) damage times/gi,
    replacement: 'Este ataque hace $1 puntos de daño multiplicados por',
  },
  {
    pattern: /This attack does (\d+) damage plus/gi,
    replacement: 'Este ataque hace $1 puntos de daño más',
  },
  {
    pattern: /This attack does (\d+) more damage for each/gi,
    replacement: 'Este ataque hace $1 puntos de daño más por cada',
  },
  {
    pattern: /Don't apply Weakness and Resistance for Benched Pokémon\./gi,
    replacement: 'No apliques Debilidad y Resistencia a los Pokémon en la Banca.',
  },

  // 3. Coin flips
  {
    pattern: /Flip a coin until you get tails\./gi,
    replacement: 'Lanza una moneda hasta que salga cruz.',
  },
  { pattern: /Flip a coin\./gi, replacement: 'Lanza una moneda.' },
  {
    pattern: /For each heads, this attack does (\d+) damage\./gi,
    replacement: 'Por cada cara, este ataque hace $1 puntos de daño.',
  },
  {
    pattern: /For each heads, this attack does (\d+) more damage\./gi,
    replacement: 'Por cada cara, este ataque hace $1 puntos de daño más.',
  },
  { pattern: /If heads,/gi, replacement: 'Si sale cara,' },
  { pattern: /If tails,/gi, replacement: 'Si sale cruz,' },

  // 4. Energy management
  {
    pattern: /Discard (a|an|\d+) Energy/gi,
    replacement: (match, qty) => {
      const q = qty.toLowerCase() === 'a' || qty.toLowerCase() === 'an' ? '1' : qty;
      return `Descarta ${q} Energía`;
    },
  },
  { pattern: /from this Pokémon\./gi, replacement: 'de este Pokémon.' },
  { pattern: /attached to this Pokémon\./gi, replacement: 'unidas a este Pokémon.' },
  { pattern: /attached to 1 of your Pokémon\./gi, replacement: 'unida a 1 de tus Pokémon.' },
  {
    pattern: /attached to your opponent's Active Pokémon\./gi,
    replacement: 'unida al Pokémon Activo de tu oponente.',
  },
  { pattern: /Search your deck for/gi, replacement: 'Busca en tu baraja' },
  { pattern: /Shuffle your deck afterward\./gi, replacement: 'Luego, baraja las cartas.' },

  // 5. Draw & Hand (general)
  { pattern: /Draw (\d+) cards?\./gi, replacement: 'Roba $1 cartas.' },
  { pattern: /Put (\d+) cards from your hand/gi, replacement: 'Pon $1 cartas de tu mano' },
  { pattern: /into your hand\./gi, replacement: 'en tu mano.' },

  // 6. Passive status rules
  {
    pattern: /The Active Pokémon is now ([a-zA-Z]+)\./gi,
    replacement: (match, status) => {
      const spanishStatus = VOCABULARY[status] || status;
      return `El Pokémon Activo pasa a estar ${spanishStatus.toLowerCase()}.`;
    },
  },
  {
    pattern: /Your opponent's Active Pokémon is now ([a-zA-Z]+)\./gi,
    replacement: (match, status) => {
      const spanishStatus = VOCABULARY[status] || status;
      return `El Pokémon Activo de tu oponente pasa a estar ${spanishStatus.toLowerCase()}.`;
    },
  },
  {
    pattern: /Both Active Pokémon are now ([a-zA-Z]+)\./gi,
    replacement: (match, status) => {
      const spanishStatus = VOCABULARY[status] || status;
      return `Ambos Pokémon Activos pasan a estar ${spanishStatus.toLowerCase()}.`;
    },
  },

  // 7. General words / phrases
  {
    pattern: /During your opponent's next turn,/gi,
    replacement: 'Durante el próximo turno de tu oponente,',
  },
  { pattern: /Once during your turn/gi, replacement: 'Una vez durante tu turno' },
  { pattern: /before your attack/gi, replacement: 'antes de tu ataque' },
  { pattern: /you may/gi, replacement: 'puedes' },
  { pattern: /If this Pokémon has/gi, replacement: 'Si este Pokémon tiene' },
  { pattern: /If your opponent has/gi, replacement: 'Si tu oponente tiene' },
];

/**
 * Translates a keyword, phrase, or paragraph of Pokémon TCG text from English to Spanish.
 */
export function translateCardText(text: string | undefined | null): string {
  if (!text) return '';

  // Check if it's a direct dictionary word
  if (VOCABULARY[text]) {
    return VOCABULARY[text];
  }

  let translated = text;

  // Apply all regex translation rules sequentially
  for (const rule of TRANSLATION_RULES) {
    translated = translated.replace(rule.pattern, rule.replacement as any);
  }

  // Fallback cleanup replacements for standard single words inside localized text
  const wordsToClean = [
    'Basic',
    'Stage 1',
    'Stage 2',
    'Weakness',
    'Resistance',
    'Retreat Cost',
    'Lost Zone',
    'Prize Cards',
    'Prize Card',
  ];
  for (const word of wordsToClean) {
    const reg = new RegExp(`\\b${word}\\b`, 'g');
    if (VOCABULARY[word]) {
      translated = translated.replace(reg, VOCABULARY[word]);
    }
  }

  return translated;
}
