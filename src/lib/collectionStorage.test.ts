// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { mergeCollections, getCollection, saveCardMeta, logCollectionValueSnapshot } from './collectionStorage';
import type { CollectionState, CollectionCardMeta } from '@/types/collection';

describe('Collection Reconciliation (Delta Merge LWW)', () => {
  it('should merge two empty collections correctly', () => {
    const local: CollectionState = { version: 1, cards: {} };
    const remote: CollectionState = { version: 1, cards: {} };
    const result = mergeCollections(local, remote);
    expect(result.cards).toEqual({});
  });

  it('should preserve cards that only exist in local or remote collection', () => {
    const cardA: CollectionCardMeta = {
      cardId: 'sv3-125',
      owned: true,
      quantity: 1,
      condition: 'Near Mint',
      variant: 'Normal',
      foil: false,
      favorite: false,
      wishlist: false,
      missing: false,
      language: 'EN',
      addedAt: '2026-05-19T12:00:00.000Z',
      updatedAt: '2026-05-19T12:00:00.000Z',
    };

    const cardB: CollectionCardMeta = {
      cardId: 'cel25-25',
      owned: true,
      quantity: 2,
      condition: 'Mint',
      variant: 'Holo',
      foil: true,
      favorite: true,
      wishlist: false,
      missing: false,
      language: 'JP',
      addedAt: '2026-05-19T13:00:00.000Z',
      updatedAt: '2026-05-19T13:00:00.000Z',
    };

    const local: CollectionState = {
      version: 1,
      cards: {
        'sv3-125': cardA,
      },
    };

    const remote: CollectionState = {
      version: 1,
      cards: {
        'cel25-25': cardB,
      },
    };

    const result = mergeCollections(local, remote);
    expect(result.cards['sv3-125']).toEqual(cardA);
    expect(result.cards['cel25-25']).toEqual(cardB);
  });

  it('should resolve conflicts using Last-Write-Wins based on updatedAt timestamp', () => {
    const cardLocalOlder: CollectionCardMeta = {
      cardId: 'sv3-125',
      owned: true,
      quantity: 1,
      condition: 'Near Mint',
      variant: 'Normal',
      foil: false,
      favorite: false,
      wishlist: false,
      missing: false,
      addedAt: '2026-05-19T12:00:00.000Z',
      updatedAt: '2026-05-19T12:00:00.000Z', // Older modification
    };

    const cardRemoteNewer: CollectionCardMeta = {
      cardId: 'sv3-125',
      owned: true,
      quantity: 5, // Remote has 5 copies
      condition: 'Near Mint',
      variant: 'Normal',
      foil: false,
      favorite: true, // User favorited it remotely
      wishlist: false,
      missing: false,
      addedAt: '2026-05-19T12:00:00.000Z',
      updatedAt: '2026-05-19T15:00:00.000Z', // Newer modification
    };

    const local: CollectionState = {
      version: 1,
      cards: {
        'sv3-125': cardLocalOlder,
      },
    };

    const remote: CollectionState = {
      version: 1,
      cards: {
        'sv3-125': cardRemoteNewer,
      },
    };

    // 1. Remote is newer -> Result should be remote
    const result1 = mergeCollections(local, remote);
    expect(result1.cards['sv3-125'].quantity).toBe(5);
    expect(result1.cards['sv3-125'].favorite).toBe(true);

    // 2. Local is newer -> Result should be local
    const cardLocalNewer = {
      ...cardLocalOlder,
      quantity: 10,
      updatedAt: '2026-05-19T18:00:00.000Z', // Newer than remote's 15:00:00
    };
    const localNewerCollection: CollectionState = {
      version: 1,
      cards: {
        'sv3-125': cardLocalNewer,
      },
    };

    const result2 = mergeCollections(localNewerCollection, remote);
    expect(result2.cards['sv3-125'].quantity).toBe(10);
    expect(result2.cards['sv3-125'].favorite).toBe(false);
  });
});

describe('Historical Value Snapshots', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should initialize history array and record snapshot matching card prices', () => {
    // Save card meta to mock collection state
    saveCardMeta('sv3-125', { owned: true, quantity: 2 });

    const mockCards = [
      {
        id: 'sv3-125',
        name: 'Charizard ex',
        supertype: 'Pokémon',
        subtypes: ['Stage 2', 'Tera'],
        types: ['Fire'],
        set: { id: 'sv3', name: 'Obsidian Flames', series: 'Scarlet & Violet', printedTotal: 197, total: 230 },
        number: '125',
        rarity: 'Double Rare',
        images: { small: '', large: '' },
        tcgplayer: {
          url: '',
          updatedAt: '2026-05-19',
          prices: {
            holofoil: { low: 10, mid: 12, high: 15, market: 12.5, directLow: 11 },
          },
        },
      },
    ];

    // Log snapshot
    logCollectionValueSnapshot(mockCards);

    const collection = getCollection();
    expect(collection.history).toBeDefined();
    expect(collection.history!.length).toBeGreaterThanOrEqual(1);

    const snapshot = collection.history![collection.history!.length - 1];
    expect(snapshot.value).toBeCloseTo(25.0, 1); // 12.5 market * 2 qty = 25 USD
    expect(snapshot.date).toBe(new Date().toISOString().split('T')[0]);
  });

  it('should not create duplicate entry if called twice on the same day', () => {
    saveCardMeta('cel25-25', { owned: true, quantity: 1 });
    const mockCards = [
      {
        id: 'cel25-25',
        name: 'Pikachu',
        supertype: 'Pokémon',
        subtypes: [],
        types: ['Lightning'],
        set: { id: 'cel25', name: 'Celebrations', series: 'Celebrations', printedTotal: 25, total: 25 },
        number: '25',
        rarity: 'Rare',
        images: { small: '', large: '' },
        tcgplayer: {
          url: '',
          updatedAt: '2026-05-19',
          prices: { normal: { low: 5, mid: 7, high: 10, market: 6.0, directLow: 5.5 } },
        },
      },
    ];

    logCollectionValueSnapshot(mockCards);
    logCollectionValueSnapshot(mockCards); // call twice

    const collection = getCollection();
    const today = new Date().toISOString().split('T')[0];
    const entriesForToday = collection.history!.filter((h) => h.date === today);
    expect(entriesForToday.length).toBe(1); // must deduplicate
  });
});
