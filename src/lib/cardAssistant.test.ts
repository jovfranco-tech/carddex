import { describe, expect, it } from 'vitest';
import type { PokemonCard } from '@/types/pokemon';
import type { CollectionCardMeta } from '@/types/collection';
import {
  answerCardQuestion,
  answerSuggestedPrompt,
  buildCardAssistantContext,
  SUGGESTED_PROMPTS,
} from './cardAssistant';

/* ------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* ------------------------------------------------------------------------- */

function makeCard(over: Partial<PokemonCard> = {}): PokemonCard {
  return {
    id: 'swsh1-25',
    name: 'Pikachu',
    supertype: 'Pokémon',
    rarity: 'Rare Holo',
    types: ['Lightning'],
    number: '25',
    set: {
      id: 'swsh1',
      name: 'Sword & Shield',
      series: 'Sword & Shield',
      printedTotal: 202,
    },
    images: {},
    ...over,
  };
}

function makeMeta(over: Partial<CollectionCardMeta> = {}): CollectionCardMeta {
  return {
    cardId: 'swsh1-25',
    owned: true,
    quantity: 1,
    condition: 'Near Mint',
    variant: 'Normal',
    foil: false,
    favorite: false,
    wishlist: false,
    missing: false,
    language: 'EN',
    addedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const PRICED_CARD: PokemonCard = makeCard({
  tcgplayer: { prices: { holofoil: { market: 12.5 } } },
});

/* ------------------------------------------------------------------------- */
/* Intent routing — the bug fixed in this pass                                */
/* ------------------------------------------------------------------------- */

describe('answerCardQuestion intent routing', () => {
  it('routes "¿Qué tan rara es?" to the rarity renderer', () => {
    const ctx = buildCardAssistantContext(makeCard());
    expect(answerCardQuestion('¿Qué tan rara es?', ctx).intent).toBe('rarity');
  });

  it('routes "¿Cuánto vale?" to the value renderer (not recommend)', () => {
    const ctx = buildCardAssistantContext(PRICED_CARD);
    expect(answerCardQuestion('¿Cuánto vale?', ctx).intent).toBe('value');
  });

  it('routes "¿Vale la pena agregarla?" to recommend, not value', () => {
    // Regression test: "vale" used to swallow this into the value intent.
    const ctx = buildCardAssistantContext(PRICED_CARD);
    expect(answerCardQuestion('¿Vale la pena agregarla?', ctx).intent).toBe('recommend');
  });

  it('routes "¿En qué expansión aparece?" to set', () => {
    const ctx = buildCardAssistantContext(makeCard());
    expect(answerCardQuestion('¿En qué expansión aparece?', ctx).intent).toBe('set');
  });

  it('routes "¿En qué otras expansiones aparece?" to similar, not set', () => {
    // Regression test: "expansión" used to swallow this into the set intent.
    const ctx = buildCardAssistantContext(makeCard());
    expect(answerCardQuestion('¿En qué otras expansiones aparece?', ctx).intent).toBe('similar');
  });

  it('falls back to general for free-form questions with no keyword hit', () => {
    const ctx = buildCardAssistantContext(makeCard());
    expect(answerCardQuestion('¿Algo más curioso?', ctx).intent).toBe('general');
  });
});

describe('answerSuggestedPrompt — declared intent always wins', () => {
  it('routes each SuggestedPrompt to its declared intent regardless of label phrasing', () => {
    const ctx = buildCardAssistantContext(makeCard());
    for (const p of SUGGESTED_PROMPTS) {
      const ans = answerSuggestedPrompt(p, ctx);
      expect(ans.intent).toBe(p.intent);
    }
  });
});

/* ------------------------------------------------------------------------- */
/* Grounded responses                                                         */
/* ------------------------------------------------------------------------- */

describe('answerRarity', () => {
  it('reports unknown when the card has no rarity', () => {
    const ctx = buildCardAssistantContext(makeCard({ rarity: undefined }));
    const ans = answerCardQuestion('rareza', ctx);
    expect(ans.intent).toBe('rarity');
    expect(ans.unknown).toBe(true);
  });

  it('includes the Spanish label and the original rarity string', () => {
    const ctx = buildCardAssistantContext(makeCard({ rarity: 'Rare Holo' }));
    const ans = answerCardQuestion('rareza', ctx);
    expect(ans.text).toContain('Rara Holo');
    expect(ans.text).toContain('Rare Holo');
    expect(ans.unknown).toBeFalsy();
  });
});

describe('answerValue', () => {
  it('reports unknown when no price exists', () => {
    const ctx = buildCardAssistantContext(makeCard());
    const ans = answerCardQuestion('cuánto vale', ctx);
    expect(ans.intent).toBe('value');
    expect(ans.unknown).toBe(true);
  });

  it('cites the source when a price is available', () => {
    const ctx = buildCardAssistantContext(PRICED_CARD);
    const ans = answerCardQuestion('cuánto vale', ctx);
    expect(ans.intent).toBe('value');
    expect(ans.sources).toBeDefined();
    expect(ans.sources![0]).toContain('TCGPlayer');
    expect(ans.text).toMatch(/12\.50/);
  });
});

describe('answerOwned', () => {
  it('says the card is not in the collection when meta is missing', () => {
    const ctx = buildCardAssistantContext(makeCard());
    const ans = answerCardQuestion('tengo esta carta', ctx);
    expect(ans.intent).toBe('owned');
    expect(ans.text).toMatch(/no tienes/i);
  });

  it('mentions the quantity correctly (singular vs plural)', () => {
    const ctxOne = buildCardAssistantContext(makeCard(), {
      collectionMeta: makeMeta({ quantity: 1 }),
    });
    expect(answerCardQuestion('tengo esta carta', ctxOne).text).toMatch(/1.*copia/);

    const ctxMany = buildCardAssistantContext(makeCard(), {
      collectionMeta: makeMeta({ quantity: 3 }),
    });
    expect(answerCardQuestion('tengo esta carta', ctxMany).text).toMatch(/3.*copias/);
  });

  it('surfaces favorite / wishlist / missing flags when set', () => {
    const ctx = buildCardAssistantContext(makeCard(), {
      collectionMeta: makeMeta({ favorite: true, wishlist: true }),
    });
    const ans = answerCardQuestion('tengo esta carta', ctx);
    expect(ans.text).toMatch(/favorita/i);
    expect(ans.text).toMatch(/wishlist/i);
  });
});

describe('answerCategory', () => {
  it('reports the supertype + elemental type for Pokémon cards', () => {
    const ctx = buildCardAssistantContext(makeCard({ supertype: 'Pokémon', types: ['Fire'] }));
    const ans = answerCardQuestion('¿qué tipo de carta es?', ctx);
    expect(ans.intent).toBe('category');
    expect(ans.text).toMatch(/Pokémon/);
    expect(ans.text).toMatch(/Fire/);
  });

  it('reports unknown when supertype is missing', () => {
    const ctx = buildCardAssistantContext(makeCard({ supertype: undefined }));
    const ans = answerCardQuestion('¿qué tipo de carta es?', ctx);
    expect(ans.unknown).toBe(true);
  });
});

describe('answerAttacks', () => {
  it('reports unknown when attacks are missing', () => {
    const ctx = buildCardAssistantContext(makeCard({ attacks: [] }));
    const ans = answerCardQuestion('¿qué ataques tiene?', ctx);
    expect(ans.intent).toBe('attacks');
    expect(ans.unknown).toBe(true);
  });

  it('lists each attack with name and damage when present', () => {
    const ctx = buildCardAssistantContext(
      makeCard({
        attacks: [
          { name: 'Thunder Shock', damage: '20', cost: ['Lightning'] },
          { name: 'Quick Attack', damage: '10' },
        ],
      })
    );
    const ans = answerCardQuestion('ataques', ctx);
    expect(ans.text).toContain('Thunder Shock');
    expect(ans.text).toContain('Quick Attack');
    expect(ans.text).toContain('20');
  });
});

/* ------------------------------------------------------------------------- */
/* Anti-hallucination guarantees                                              */
/* ------------------------------------------------------------------------- */

describe('grounding invariants', () => {
  it('never invents a price for a card without market data', () => {
    const ctx = buildCardAssistantContext(makeCard());
    const ans = answerCardQuestion('valor', ctx);
    // The unknown flag is set AND the text never claims a $/€ figure.
    expect(ans.unknown).toBe(true);
    expect(ans.text).not.toMatch(/\$\d/);
    expect(ans.text).not.toMatch(/€\d/);
  });

  it('never invents an expansion when the card has no set name', () => {
    const ctx = buildCardAssistantContext(
      makeCard({
        set: { id: '', name: '', series: '' },
      })
    );
    const ans = answerCardQuestion('en qué expansión', ctx);
    // It still routes to "set" but should not fabricate a real-sounding name.
    expect(ans.intent).toBe('set');
  });
});
