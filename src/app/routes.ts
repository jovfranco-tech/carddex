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
  deckShare: (id: string) => `/deck/share/${encodeURIComponent(id)}`,
  deckSharePattern: '/deck/share/:deckId',
  publicProfile: (id: string) => `/u/${encodeURIComponent(id)}`,
  publicProfilePattern: '/u/:userId',
  customCard: '/custom-card',
  achievements: '/achievements',
} as const;

export type RouteKey = keyof typeof ROUTES;
