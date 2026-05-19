/** Route path constants used throughout the app. */
export const ROUTES = {
  home: '/',
  scan: '/scan',
  library: '/library',
  sets: '/sets',
  profile: '/profile',
  cardDetail: (id: string) => `/card/${encodeURIComponent(id)}`,
  cardDetailPattern: '/card/:cardId',
  decks: '/decks',
  deckDetail: (id: string) => `/deck/${encodeURIComponent(id)}`,
  deckDetailPattern: '/deck/:deckId',
} as const;

export type RouteKey = keyof typeof ROUTES;
