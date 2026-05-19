/**
 * Card Assistant — a grounded, rule-based answering layer for Pokémon TCG cards.
 *
 * MVP IS DETERMINISTIC. We never call a real LLM, never invent prices, rarity,
 * or set membership. Every claim the assistant makes must trace back to a
 * concrete field on `CardAssistantContext`. Missing data → say so explicitly.
 *
 * TODO (v2):
 *   - Future: create /api/card-assistant serverless endpoint
 *   - Future: send only grounded CardAssistantContext and user question
 *   - Future: never expose LLM API keys in frontend
 *   - Future: keep Pokémon TCG API card data as source of truth
 *   - The endpoint must rate-limit per IP / per session.
 *   - Each answer should carry citations referencing the originating field
 *     (e.g. `card.tcgplayer.prices.holofoil.market`) so the UI can show a
 *     "Fuente: TCGPlayer" chip next to the value.
 */

import type { PokemonCard } from '@/types/pokemon';
import type { CollectionCardMeta } from '@/types/collection';
import {
  getEstimatedPrice,
  formatPrice,
  type EstimatedPrice,
  PRICE_DISCLAIMER,
} from './pricing';
import { normalizeRarity, rarityLabel } from './rarity';
import { classifyCategory, type CardCategory } from './cardRecognition';

/* ------------------------------------------------------------------------- */
/* Public types                                                              */
/* ------------------------------------------------------------------------- */

export interface CardAssistantContext {
  card: PokemonCard;
  collectionMeta?: CollectionCardMeta;
  estimatedPrice: EstimatedPrice | null;
  /** Cards with the same name (used for "Aparece en"). */
  similarCards: PokemonCard[];
  /** Total collection summary (for "do I own this set" style questions). */
  ownedCountInSet?: number;
  printedTotalInSet?: number;
}

export type AssistantIntent =
  | 'rarity'
  | 'value'
  | 'set'
  | 'owned'
  | 'category'
  | 'attacks'
  | 'abilities'
  | 'weaknesses'
  | 'retreat'
  | 'variants'
  | 'recommend'
  | 'similar'
  | 'unsupported'
  | 'general';

export interface AssistantAnswer {
  intent: AssistantIntent;
  /** Markdown-ish plain text. Newlines are preserved. */
  text: string;
  /** Optional source labels for citation chips (e.g. "TCGPlayer"). */
  sources?: string[];
  /** True when the answer reports missing data rather than a real value. */
  unknown?: boolean;
}

export interface SuggestedPrompt {
  id: string;
  label: string;
  intent: AssistantIntent;
}

/* ------------------------------------------------------------------------- */
/* Context builder                                                           */
/* ------------------------------------------------------------------------- */

export function buildCardAssistantContext(
  card: PokemonCard,
  options: {
    collectionMeta?: CollectionCardMeta;
    similarCards?: PokemonCard[];
    ownedCountInSet?: number;
    printedTotalInSet?: number;
  } = {},
): CardAssistantContext {
  return {
    card,
    collectionMeta: options.collectionMeta,
    estimatedPrice: getEstimatedPrice(card),
    similarCards: options.similarCards ?? [],
    ownedCountInSet: options.ownedCountInSet,
    printedTotalInSet: options.printedTotalInSet ?? card.set?.printedTotal,
  };
}

/* ------------------------------------------------------------------------- */
/* Suggested prompts                                                          */
/* ------------------------------------------------------------------------- */

export const SUGGESTED_PROMPTS: ReadonlyArray<SuggestedPrompt> = [
  { id: 'rarity', label: '¿Qué tan rara es esta carta?', intent: 'rarity' },
  { id: 'value', label: '¿Cuál es su valor estimado?', intent: 'value' },
  { id: 'set', label: '¿En qué expansión aparece?', intent: 'set' },
  { id: 'owned', label: '¿Tengo esta carta en mi colección?', intent: 'owned' },
  { id: 'category', label: '¿Qué tipo de carta es?', intent: 'category' },
  { id: 'attacks', label: '¿Qué ataques tiene?', intent: 'attacks' },
  { id: 'variants', label: '¿Qué variantes existen?', intent: 'variants' },
  { id: 'recommend', label: '¿Vale la pena agregarla a mi colección?', intent: 'recommend' },
  { id: 'similar', label: '¿En qué otras expansiones aparece?', intent: 'similar' },
];

/* ------------------------------------------------------------------------- */
/* Intent detection                                                          */
/* ------------------------------------------------------------------------- */

interface IntentRule {
  intent: AssistantIntent;
  keywords: string[];
}

const INTENT_RULES: ReadonlyArray<IntentRule> = [
  // More specific multi-word phrases are checked first so they don't get
  // swallowed by single-word matches further down the list (e.g.
  // "vale la pena" must hit `recommend`, not `value`'s loose "vale").
  { intent: 'recommend', keywords: ['vale la pena', 'recomienda', 'recomendable', 'debería', 'comprar', 'agregar', 'añadir'] },
  { intent: 'similar', keywords: ['aparece en', 'otras versiones', 'otras expansion', 'otras expansión', 'reimpresión', 'reprint', 'similares', 'otra carta'] },

  { intent: 'rarity', keywords: ['rara', 'raro', 'rareza', 'rarity', 'común', 'comun'] },
  { intent: 'value', keywords: ['valor', 'precio', 'cuesta', 'cuánto vale', 'cuanto vale', 'price'] },
  { intent: 'set', keywords: ['expansion', 'expansión', 'set', 'colección de', 'serie', 'edición'] },
  { intent: 'owned', keywords: ['tengo', 'mi colección', 'poseo', 'duplicad', 'tengo esta'] },
  { intent: 'category', keywords: ['tipo de carta', 'qué tipo', 'pokémon o', 'entrenador', 'energía', 'category', 'type'] },
  { intent: 'attacks', keywords: ['ataque', 'ataques', 'movimiento', 'movimientos'] },
  { intent: 'abilities', keywords: ['habilidad', 'habilidades', 'ability', 'abilities', 'poder', 'rule', 'regla'] },
  { intent: 'weaknesses', keywords: ['debilidad', 'debilidades', 'resistencia', 'resistencias'] },
  { intent: 'retreat', keywords: ['retirada', 'coste de retirada', 'retreat'] },
  { intent: 'variants', keywords: ['variante', 'variantes', 'reverse', 'holo', 'foil', 'primera edición'] },
];

function detectIntent(question: string): AssistantIntent {
  const q = question.toLowerCase();
  for (const rule of INTENT_RULES) {
    if (rule.keywords.some((kw) => q.includes(kw))) {
      return rule.intent;
    }
  }
  return 'general';
}

/* ------------------------------------------------------------------------- */
/* Answer renderers                                                           */
/* ------------------------------------------------------------------------- */

function answerRarity(ctx: CardAssistantContext): AssistantAnswer {
  const { card } = ctx;
  if (!card.rarity) {
    return {
      intent: 'rarity',
      text: 'La rareza no aparece declarada en los datos de esta carta.',
      unknown: true,
    };
  }
  const group = normalizeRarity(card.rarity);
  const label = rarityLabel(card.rarity);
  return {
    intent: 'rarity',
    text: `Esta carta se clasifica como **${label}** (rareza original: “${card.rarity}”).`
      + (group === 'Secret Rare' || group === 'Hyper Rare' || group === 'Special Illustration Rare'
        ? ' Está entre las rarezas más altas del juego — muy buscadas por coleccionistas.'
        : group === 'Common'
          ? ' Es una rareza común, fácil de encontrar en sobres.'
          : ''),
    sources: ['Pokémon TCG API · rarity'],
  };
}

function answerValue(ctx: CardAssistantContext): AssistantAnswer {
  const { estimatedPrice } = ctx;
  if (!estimatedPrice) {
    return {
      intent: 'value',
      text:
        'No hay precio publicado para esta carta en los proveedores que consultamos '
        + '(TCGPlayer y Cardmarket). Esto puede pasar con cartas muy nuevas, '
        + 'promocionales o de idiomas con poco mercado.',
      unknown: true,
    };
  }
  const formatted = formatPrice(estimatedPrice);
  return {
    intent: 'value',
    text: `Valor estimado: **${formatted}** (fuente: ${estimatedPrice.source}).\n\n${PRICE_DISCLAIMER}`,
    sources: [estimatedPrice.source],
  };
}

function answerSet(ctx: CardAssistantContext): AssistantAnswer {
  const { card, ownedCountInSet, printedTotalInSet } = ctx;
  const set = card.set;
  if (!set) {
    return {
      intent: 'set',
      text: 'No tenemos información de expansión para esta carta.',
      unknown: true,
    };
  }
  const lines: string[] = [];
  lines.push(`Aparece en **${set.name}** (serie ${set.series}).`);
  if (set.releaseDate) lines.push(`Fecha de lanzamiento: ${set.releaseDate}.`);
  if (card.number) {
    const total = set.printedTotal ?? set.total;
    lines.push(`Número en el set: ${card.number}${total ? `/${total}` : ''}.`);
  }
  if (
    typeof ownedCountInSet === 'number' &&
    typeof printedTotalInSet === 'number' &&
    printedTotalInSet > 0
  ) {
    const pct = Math.round((ownedCountInSet / printedTotalInSet) * 100);
    lines.push(`Llevas ${ownedCountInSet}/${printedTotalInSet} (${pct}%) de esta expansión.`);
  }
  return {
    intent: 'set',
    text: lines.join('\n'),
    sources: ['Pokémon TCG API · set'],
  };
}

function answerOwned(ctx: CardAssistantContext): AssistantAnswer {
  const meta = ctx.collectionMeta;
  if (!meta || (!meta.owned && !meta.wishlist && !meta.favorite && !meta.missing)) {
    return {
      intent: 'owned',
      text: 'Aún no tienes esta carta registrada en tu colección.',
    };
  }
  const lines: string[] = [];
  if (meta.owned && meta.quantity > 0) {
    lines.push(`Tienes **${meta.quantity}** ${meta.quantity === 1 ? 'copia' : 'copias'} guardadas.`);
  } else if (meta.owned) {
    lines.push('Está marcada como tuya, pero la cantidad es 0.');
  }
  if (meta.favorite) lines.push('Está marcada como **favorita** ⭐.');
  if (meta.wishlist) lines.push('Está en tu **wishlist**.');
  if (meta.missing) lines.push('Está marcada como **falta** (sabes que la quieres pero no la has conseguido).');
  if (meta.foil || meta.variant !== 'Normal') {
    const parts: string[] = [];
    if (meta.foil) parts.push('foil');
    if (meta.variant && meta.variant !== 'Normal') parts.push(meta.variant.toLowerCase());
    lines.push(`Registrada como: ${parts.join(' · ')}.`);
  }
  if (meta.condition && meta.condition !== 'Near Mint') {
    lines.push(`Condición guardada: ${meta.condition}.`);
  }
  if (meta.language && meta.language !== 'EN') {
    lines.push(`Idioma: ${meta.language}.`);
  }
  return {
    intent: 'owned',
    text: lines.join('\n'),
    sources: ['LocalStorage · carddex.collection.v1'],
  };
}

function answerCategory(ctx: CardAssistantContext): AssistantAnswer {
  const { card } = ctx;
  const category: CardCategory = classifyCategory(card);
  if (category === 'Unknown') {
    return {
      intent: 'category',
      text: 'No podemos determinar la categoría de esta carta con los datos disponibles.',
      unknown: true,
    };
  }
  const lines: string[] = [];
  lines.push(`Es una carta de tipo **${category}**.`);
  if (category === 'Pokémon' && card.types && card.types.length > 0) {
    lines.push(`Tipo elemental: ${card.types.join(', ')}.`);
  }
  if (card.subtypes && card.subtypes.length > 0) {
    lines.push(`Subtipos: ${card.subtypes.join(', ')}.`);
  }
  if (card.hp) lines.push(`PS: ${card.hp}.`);
  return {
    intent: 'category',
    text: lines.join('\n'),
    sources: ['Pokémon TCG API · supertype/types'],
  };
}

function answerAttacks(ctx: CardAssistantContext): AssistantAnswer {
  const attacks = ctx.card.attacks;
  if (!attacks || attacks.length === 0) {
    return {
      intent: 'attacks',
      text: 'Esta carta no declara ataques (puede ser un Entrenador, Energía, o no estar disponible).',
      unknown: true,
    };
  }
  const lines = attacks.map((a) => {
    const cost = a.cost && a.cost.length > 0 ? ` [Coste: ${a.cost.join(' ')}]` : '';
    const dmg = a.damage ? ` — ${a.damage} daño` : '';
    return `• **${a.name}**${cost}${dmg}${a.text ? `\n  ${a.text}` : ''}`;
  });
  return {
    intent: 'attacks',
    text: `Ataques de esta carta:\n${lines.join('\n')}`,
    sources: ['Pokémon TCG API · attacks'],
  };
}

function answerAbilities(ctx: CardAssistantContext): AssistantAnswer {
  const abilities = ctx.card.abilities;
  if (!abilities || abilities.length === 0) {
    return {
      intent: 'abilities',
      text: 'Esta carta no tiene habilidades declaradas.',
      unknown: true,
    };
  }
  const lines = abilities.map(
    (a) => `• **${a.name}** (${a.type ?? 'Habilidad'})${a.text ? `\n  ${a.text}` : ''}`,
  );
  return {
    intent: 'abilities',
    text: `Habilidades:\n${lines.join('\n')}`,
    sources: ['Pokémon TCG API · abilities'],
  };
}

function answerWeaknesses(ctx: CardAssistantContext): AssistantAnswer {
  const { card } = ctx;
  const lines: string[] = [];
  if (card.weaknesses && card.weaknesses.length > 0) {
    lines.push(
      `Debilidades: ${card.weaknesses.map((w) => `${w.type} ${w.value}`).join(', ')}.`,
    );
  } else {
    lines.push('No declara debilidades.');
  }
  if (card.resistances && card.resistances.length > 0) {
    lines.push(
      `Resistencias: ${card.resistances.map((r) => `${r.type} ${r.value}`).join(', ')}.`,
    );
  }
  return {
    intent: 'weaknesses',
    text: lines.join('\n'),
    sources: ['Pokémon TCG API · weaknesses/resistances'],
    unknown: lines[0].startsWith('No declara'),
  };
}

function answerRetreat(ctx: CardAssistantContext): AssistantAnswer {
  const { card } = ctx;
  if (
    typeof card.convertedRetreatCost === 'undefined' &&
    (!card.retreatCost || card.retreatCost.length === 0)
  ) {
    return {
      intent: 'retreat',
      text: 'No hay información de coste de retirada para esta carta.',
      unknown: true,
    };
  }
  const cost = card.convertedRetreatCost ?? card.retreatCost?.length ?? 0;
  return {
    intent: 'retreat',
    text: `Coste de retirada: **${cost}** energía${cost === 1 ? '' : 's'} incolora${cost === 1 ? '' : 's'}.`,
    sources: ['Pokémon TCG API · retreatCost'],
  };
}

function answerVariants(ctx: CardAssistantContext): AssistantAnswer {
  const prices = ctx.card.tcgplayer?.prices;
  const cm = ctx.card.cardmarket?.prices;
  const variants: string[] = [];
  if (prices?.normal) variants.push('Normal');
  if (prices?.holofoil) variants.push('Holofoil');
  if (prices?.reverseHolofoil) variants.push('Reverse Holo');
  if (prices?.['1stEditionHolofoil']) variants.push('1ª Edición Holo');
  if (prices?.['1stEditionNormal']) variants.push('1ª Edición');
  if (prices?.unlimitedHolofoil) variants.push('Unlimited Holo');
  if (prices?.unlimited) variants.push('Unlimited');
  if (variants.length === 0 && cm) variants.push('Variante única en Cardmarket');

  if (variants.length === 0) {
    return {
      intent: 'variants',
      text:
        'No tenemos datos de variantes (foil/normal/reverse) para esta carta. '
        + 'Algunas cartas modernas solo se imprimen en una variante.',
      unknown: true,
    };
  }
  return {
    intent: 'variants',
    text:
      `Variantes detectadas en los datos de mercado:\n• ${variants.join('\n• ')}\n\n`
      + 'Las variantes afectan al valor estimado: por defecto preferimos la cotización Holofoil cuando existe.',
    sources: ['TCGPlayer · prices'],
  };
}

function answerRecommend(ctx: CardAssistantContext): AssistantAnswer {
  const { estimatedPrice, collectionMeta, card } = ctx;
  const rarityGroup = normalizeRarity(card.rarity);
  const isHighEnd =
    rarityGroup === 'Secret Rare' ||
    rarityGroup === 'Hyper Rare' ||
    rarityGroup === 'Special Illustration Rare';

  const lines: string[] = [];
  if (collectionMeta?.owned && collectionMeta.quantity > 0) {
    lines.push(`Ya tienes ${collectionMeta.quantity} copia(s) de esta carta.`);
    if (collectionMeta.quantity > 1) {
      lines.push('Tiene duplicados, así que podrías mantener uno y dar/intercambiar los demás.');
    }
  } else if (collectionMeta?.wishlist) {
    lines.push('Ya está en tu wishlist, lo cual indica que la quieres.');
  } else {
    lines.push('Aún no la tienes registrada.');
  }
  if (isHighEnd) {
    lines.push(`Por rareza (${rarityLabel(card.rarity)}) es una carta destacada — buena candidata para colección.`);
  }
  if (estimatedPrice) {
    lines.push(`Valor estimado: ${formatPrice(estimatedPrice)} — útil como referencia, no como precio de venta.`);
  } else {
    lines.push('Sin precio publicado en este momento, así que no puedo dar un punto de referencia económico.');
  }
  lines.push('');
  lines.push(
    '⚠ No es consejo financiero. Decide según tu presupuesto, gustos personales, y el estado real de la carta.',
  );
  return {
    intent: 'recommend',
    text: lines.join('\n'),
    sources: estimatedPrice ? [estimatedPrice.source] : undefined,
  };
}

function answerSimilar(ctx: CardAssistantContext): AssistantAnswer {
  const others = ctx.similarCards.filter((c) => c.id !== ctx.card.id);
  if (others.length === 0) {
    return {
      intent: 'similar',
      text: 'No encontramos otras impresiones de esta carta en la API.',
      unknown: true,
    };
  }
  const grouped = new Map<string, string[]>();
  for (const c of others) {
    const setName = c.set?.name ?? 'Otra expansión';
    const arr = grouped.get(setName) ?? [];
    arr.push(`#${c.number}${c.rarity ? ` — ${rarityLabel(c.rarity)}` : ''}`);
    grouped.set(setName, arr);
  }
  const lines = Array.from(grouped.entries()).map(
    ([setName, items]) => `• **${setName}** — ${items.join(', ')}`,
  );
  return {
    intent: 'similar',
    text: `${ctx.card.name} también aparece en:\n${lines.join('\n')}`,
    sources: ['Pokémon TCG API · search by name'],
  };
}

function answerGeneral(ctx: CardAssistantContext): AssistantAnswer {
  const { card } = ctx;
  const category = classifyCategory(card);
  const lines: string[] = [];
  lines.push(`**${card.name}** — ${rarityLabel(card.rarity)}.`);
  lines.push(`Categoría: ${category}.`);
  if (card.set) {
    lines.push(`Expansión: ${card.set.name} (${card.set.series})${card.number ? `, número ${card.number}` : ''}.`);
  }
  if (card.types?.length) lines.push(`Tipo: ${card.types.join(', ')}.`);
  if (card.hp) lines.push(`PS: ${card.hp}.`);
  if (ctx.estimatedPrice) {
    lines.push(`Valor estimado: ${formatPrice(ctx.estimatedPrice)} (${ctx.estimatedPrice.source}).`);
  }
  if (ctx.collectionMeta?.owned) {
    lines.push(`Ya está en tu colección (${ctx.collectionMeta.quantity}× ).`);
  }
  lines.push('');
  lines.push('Pregunta por rareza, valor, ataques, variantes o expansión para más detalle.');
  return {
    intent: 'general',
    text: lines.join('\n'),
    sources: ['Pokémon TCG API'],
  };
}

/* ------------------------------------------------------------------------- */
/* Entry point                                                                */
/* ------------------------------------------------------------------------- */

/**
 * Dispatch a known intent to its renderer. Kept private so the only public
 * entry points remain `answerCardQuestion` and `answerSuggestedPrompt`.
 */
function answerByIntent(
  intent: AssistantIntent,
  context: CardAssistantContext,
): AssistantAnswer {
  switch (intent) {
    case 'rarity':
      return answerRarity(context);
    case 'value':
      return answerValue(context);
    case 'set':
      return answerSet(context);
    case 'owned':
      return answerOwned(context);
    case 'category':
      return answerCategory(context);
    case 'attacks':
      return answerAttacks(context);
    case 'abilities':
      return answerAbilities(context);
    case 'weaknesses':
      return answerWeaknesses(context);
    case 'retreat':
      return answerRetreat(context);
    case 'variants':
      return answerVariants(context);
    case 'recommend':
      return answerRecommend(context);
    case 'similar':
      return answerSimilar(context);
    case 'unsupported':
    case 'general':
    default:
      return answerGeneral(context);
  }
}

/**
 * Answer a free-form user question using only the provided context.
 * The function is synchronous on purpose: no network, no LLM. Always returns
 * a grounded answer or an honest "unknown" statement.
 */
export function answerCardQuestion(
  question: string,
  context: CardAssistantContext,
): AssistantAnswer {
  return answerByIntent(detectIntent(question), context);
}

/**
 * Resolve a SuggestedPrompt to its answer. Uses the prompt's declared intent
 * directly — bypassing keyword detection — so suggested-prompt labels never
 * route to the wrong renderer when their phrasing overlaps multiple intents.
 */
export function answerSuggestedPrompt(
  prompt: SuggestedPrompt,
  context: CardAssistantContext,
): AssistantAnswer {
  return answerByIntent(prompt.intent, context);
}
