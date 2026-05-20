import { supabase } from './supabaseClient';

export interface Deck {
  id: string;
  name: string;
  cards: string[]; // Array of cardIds
  updatedAt: string;
}

export interface DecksState {
  version: number;
  decks: Record<string, Deck>;
}

const DEFAULT_DECKS: DecksState = {
  version: 1,
  decks: {}
};

const DECKS_KEY = 'carddex.decks.v1';

const SUBSCRIBERS = new Set<() => void>();
function notify() {
  SUBSCRIBERS.forEach((fn) => fn());
}

export function subscribeDecks(listener: () => void): () => void {
  SUBSCRIBERS.add(listener);
  return () => {
    SUBSCRIBERS.delete(listener);
  };
}

function safeRead<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { }
}

export function getDecksState(): DecksState {
  return safeRead<DecksState>(DECKS_KEY, DEFAULT_DECKS);
}

function writeDecksState(state: DecksState): void {
  safeWrite(DECKS_KEY, state);
  notify();
}

export function createDeck(name: string): Deck {
  const state = getDecksState();
  const id = `deck_${Date.now()}`;
  const deck: Deck = {
    id,
    name,
    cards: [],
    updatedAt: new Date().toISOString()
  };
  state.decks[id] = deck;
  writeDecksState(state);
  return deck;
}

export function deleteDeck(id: string): void {
  const state = getDecksState();
  delete state.decks[id];
  writeDecksState(state);
}

export function addCardToDeck(deckId: string, cardId: string): void {
  const state = getDecksState();
  if (!state.decks[deckId]) return;
  if (state.decks[deckId].cards.length >= 60) return; // Max 60 cards
  state.decks[deckId].cards.push(cardId);
  state.decks[deckId].updatedAt = new Date().toISOString();
  writeDecksState(state);
}

export function removeCardFromDeck(deckId: string, cardId: string): void {
  const state = getDecksState();
  if (!state.decks[deckId]) return;
  const index = state.decks[deckId].cards.indexOf(cardId);
  if (index > -1) {
    state.decks[deckId].cards.splice(index, 1);
    state.decks[deckId].updatedAt = new Date().toISOString();
    writeDecksState(state);
  }
}

export function updateDeckCards(deckId: string, cards: string[]): void {
  const state = getDecksState();
  if (!state.decks[deckId]) return;
  state.decks[deckId].cards = cards;
  state.decks[deckId].updatedAt = new Date().toISOString();
  writeDecksState(state);
}

export function removeCardFromDeckAll(deckId: string, cardId: string): void {
  const state = getDecksState();
  if (!state.decks[deckId]) return;
  state.decks[deckId].cards = state.decks[deckId].cards.filter((id) => id !== cardId);
  state.decks[deckId].updatedAt = new Date().toISOString();
  writeDecksState(state);
}
