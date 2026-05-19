# Changelog

All notable changes to CardDex are documented here.
The format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.1] — 2026-05

- Post-deploy QA fixes
- Production stability improvements
- Mobile layout fixes
- API error handling improvements
- LocalStorage hardening
- Scanner assisted detection stability
- Card Assistant grounding improvements
- Documentation updates
- API Configuration refinements with base URL variable and LLM placeholders

## [1.0.0] — 2026-05

- Final Vercel-ready MVP
- Pokémon TCG API integration
- Card search and detail
- LocalStorage collection
- Favorites and wishlist
- Rarity normalization and sorting
- Estimated value display
- Sets / expansions browser
- Simulated/assisted scanner
- Card type classification architecture
- Rule-based Card Assistant
- Import/export collection
- Mobile-first collector UI
- Fan project disclaimers
- Deployment documentation

## [1.0.0-rc2] — 2026-05 (Pase 4 — hardening + tests)

### Added
- **Vitest test suite** with 67 tests across four files covering pure logic:
  - `src/lib/rarity.test.ts` — normalization across all 15 groups, sort weight
    monotonicity, label localization, filter membership.
  - `src/lib/pricing.test.ts` — full waterfall priority, zero/NaN/null handling,
    short and full formatters, mixed-currency totals, qty multiplication.
  - `src/lib/cardAssistant.test.ts` — intent routing (incl. regressions),
    grounded responses, anti-hallucination guarantees on missing data.
  - `src/lib/cardRecognition.test.ts` — `classifyCardCategory`,
    `classifyPokemonTypes`, `buildRecognitionResultFromApiCard`,
    `getRecognitionConfidence` threshold.
- `npm run test` (watch) and `npm run test:run` (one-shot) scripts.

### Fixed
- **Card Assistant intent routing bug.** `'¿Vale la pena agregarla?'` was being
  classified as `value` because the loose `'vale'` keyword sat above the
  `recommend` rule. Similarly `'¿En qué otras expansiones aparece?'` was being
  routed to `set` instead of `similar`. Both fixed by reordering `INTENT_RULES`
  so multi-word specific phrases are checked before single-word fallbacks,
  and by tightening `value`'s keywords (`cuanto vale` instead of bare `vale`).
- **Suggested-prompt routing.** Tapping a `SuggestedPrompt` used to re-route
  through the keyword detector. It now dispatches via the prompt's declared
  `intent`, so suggested prompts can never land on the wrong renderer.

### Changed
- Split the intent → renderer mapping into a private `answerByIntent` helper
  shared by both `answerCardQuestion` (free-form) and `answerSuggestedPrompt`
  (tap a chip). Single source of truth.
- `CardAssistantSheet`'s `ask` callback now accepts an optional pre-resolved
  `AssistantAnswer`. Suggested-prompt buttons call a new `askPrompt(prompt)`
  helper that resolves the answer via `answerSuggestedPrompt` before handing
  it to `ask`.
- `tsconfig.app.json` now excludes `*.test.ts` from the production type-check
  so Vite's emit doesn't touch them.

### Validated
- `npm run typecheck` ✅
- `npm run test:run` ✅ 67/67
- `npm run build` ✅ 71 modules, 282.99 KB JS / 85.82 KB gzip
- `npm run lint` — script still absent; not invented.

---

## [1.0.0-rc1] — 2026-05

First release candidate.

### Added
- Vercel SPA configuration (`vercel.json`) with deep-link rewrites and asset caching.
- Card Assistant note in Profile clarifying the assistant is rule-based.
- `aria-label="Buscar cartas"` and `type="search"` on the search input.
- CHANGELOG.

### Changed
- Bumped version to `1.0.0-rc1` in `package.json` and Profile screen.
- `QuantitySelector` in Detail now enforces `min={1}` as documented by the spec.
- `handleSave` simplified: saving always flags the card as owned with a quantity ≥ 1.
- `clearCollection` now also removes the settings key so a "clear data" action
  truly resets the user state.
- `importCollection` is now defensive: it coerces booleans and clamps quantity,
  so a malformed export cannot poison the LocalStorage shape.

### Fixed
- **Toast timer restart bug.** `Toast`'s effect previously depended on the inline
  `onHide` callback, restarting the auto-hide timer on every parent re-render.
  The handler is now held in a ref so the timer fires reliably.

### Documentation
- README rewritten with: what's real vs. simulated, future v2 roadmap,
  Vercel deploy instructions (dashboard + CLI), project tree, known
  limitations, honest note that there's no lint script or test suite.

---

## [0.2.0] — 2026-05 (Pass 2 — polish + assistant)

### Added
- `lib/cardRecognition.ts` — architecture module for camera-based detection
  with a typed `RecognitionResult` contract and mock implementation. v2 OCR
  and pHash plans are inline as TODOs.
- `lib/cardAssistant.ts` — deterministic, rule-based assistant grounded in
  card + collection data. Twelve intents, nine suggested prompts, never
  invents prices or rarity.
- `components/CardAssistantButton.tsx`, `CardAssistantSheet.tsx`,
  `ChatMessage.tsx` — entry button, bottom-sheet chat, and grounded message
  bubble.
- Collection insights on Home (rarest card, most valuable, most-progressed
  set, duplicate count).
- Collection state badges on Detail (En mi colección · N · Duplicada ·
  Favorita · Wishlist · Falta).
- Variant + Condition selectors in the add-to-collection panel.
- Standard `PRICE_DISCLAIMER` shown next to every estimated value.
- `formatCollectionValue` for mixed USD / EUR totals.
- Rarity expanded to 15 groups: `Rare Holo EX`, `Radiant Rare`, `Amazing Rare`
  added alongside the existing tiers.
- `language?: string` field on `CollectionCardMeta`.
- `resetRecentlyViewed` storage helper + Profile action row.
- `clearApiCache` exposed and wired into Profile's "Borrar datos locales".

### Changed
- `EstimatedPrice` now carries `provider` and `tier` so the UI can show
  consistent source chips.
- `pokemonTcgApi`: every public function accepts `{ signal }`. Card and
  sets caches added for the session. `isAbortError` helper added.
- `useAsync` rewritten to provide an `AbortSignal` and ignore aborted
  errors silently.
- `getCollection` now validates each entry and reconciles with defaults
  so corrupted LocalStorage cannot crash the app.
- Scanner refactored to drive from `recognizeCardFromImage`; the detected
  panel surfaces category (Pokémon / Trainer / Energy), elemental types,
  set name, and card number.

---

## [0.1.0] — 2026-05 (Pass 1 — initial MVP)

First end-to-end implementation:
- React + Vite + TypeScript scaffold.
- Six screens — Home, Scan, Detail, Library, Sets, Profile.
- Bottom navigation with light iOS aesthetic.
- Pokémon TCG API integration with rarity normalization and pricing.
- LocalStorage collection (quantity, foil, condition, variant, favorite,
  wishlist, missing).
- Recently viewed history.
- Export / import collection JSON.
- Dark scanner UI with simulated capture and a manual correction sheet.
