# CardDex

**v1.0.1**

Production URL: [https://carddex-coral.vercel.app](https://carddex-coral.vercel.app)
A mobile-first personal Pokémon TCG collection app. CardDex is a digital binder, scanner, library, set browser, and contextual card assistant — built as a single React + Vite + TypeScript SPA. Card data comes from the public [Pokémon TCG API](https://pokemontcg.io/); your collection lives in your browser's LocalStorage.

> **Personal fan project — not affiliated with Nintendo, The Pokémon Company, Creatures Inc., or Game Freak.** All trademarks and rights belong to their respective owners.

---

## What's real vs. simulated

**Real**
- Card search via the Pokémon TCG API
- Card detail (attacks, abilities, weaknesses, resistances, retreat cost, flavor text, artist, …)
- Set list, set symbol, set series, release date, printed total
- Set completion progress derived from your collection
- LocalStorage collection — favorites, wishlist, quantity, foil, condition, variant, language, notes
- Recently viewed list
- Estimated value from TCGPlayer (USD) with Cardmarket (EUR) as fallback

**Simulated / assisted**
- Scanner recognition — `lib/cardRecognition.ts` rotates through a small set of popular card names and queries the real API for each result. UI, confidence score, category badge, type chips and set/number are all derived from the real card returned by the API. The architecture is ready for a real OCR + image-hashing pipeline in v2 without changing the UI's contract.
- Card Assistant — `lib/cardAssistant.ts` is a deterministic, rule-based answer engine grounded in card data, collection metadata, and pricing. **No LLM is called.** Every answer maps to a specific field on `CardAssistantContext`; missing data is reported as missing, never invented.

**Future (v2)**
- Real camera capture + on-device OCR for card number / name
- Image-hash matching against a precomputed catalog
- Optional serverless `/api/card-assistant` endpoint for a real LLM, with the same `CardAssistantContext` as the grounding input
- Cloud sync of LocalStorage data
- Multi-language card support (ES / JP / IT)
- Set completion checklist with missing-card placeholders inside Library
- PWA shell + install prompt

---

## Tech stack

- React 18 + TypeScript 5
- Vite 5
- React Router 6
- No CSS framework — design tokens in `src/styles/tokens.css`, all components use inline styles + CSS variables
- No backend, no auth, no database

---

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173
```

### Optional: API key

The Pokémon TCG API works unauthenticated but has a tight rate limit. To use your own key, copy `.env.example` to `.env.local` and fill it in:

```bash
cp .env.example .env.local
# edit .env.local
VITE_POKEMON_TCG_API_BASE_URL=https://api.pokemontcg.io/v2
VITE_POKEMON_TCG_API_KEY=your_key_here
```

Get a free key at [dev.pokemontcg.io](https://dev.pokemontcg.io/). The key is read at build time via Vite's `import.meta.env` and sent as the `X-Api-Key` header. It is never logged, persisted, or exposed in storage.

---

## Build

```bash
npm run typecheck    # tsc -b --noEmit
npm run build        # tsc -b && vite build
npm run preview      # preview the production build locally
```

There is currently **no `lint` script** and **no test suite** — these are noted as gaps in the roadmap rather than reported as passing.

---

## Deploy to Vercel

The repo includes `vercel.json` with SPA rewrites so deep links (e.g. `/card/swsh1-25`) keep working after refresh.

### Option A — Vercel dashboard

1. Push the repo to GitHub / GitLab / Bitbucket.
2. Import the project at [vercel.com/new](https://vercel.com/new).
3. Vercel auto-detects Vite. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.
4. Vercel Environment Variables (Project Settings → Environment Variables):
   - `VITE_POKEMON_TCG_API_BASE_URL` = `https://api.pokemontcg.io/v2`
   - `VITE_POKEMON_TCG_API_KEY` = optional Pokémon TCG API key (do not commit real keys to the repo)
5. Deploy.

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel              # follow prompts
vercel --prod       # promote to production
```

Add the env var with:

```bash
vercel env add VITE_POKEMON_TCG_API_BASE_URL
vercel env add VITE_POKEMON_TCG_API_KEY
```

---

## Project structure

```
src/
  app/                Router & shell entry point
  components/         Reusable UI primitives (SearchBar, CardTile, RarityBadge…)
                      Plus assistant: CardAssistantButton, CardAssistantSheet, ChatMessage
  lib/                Pure logic: API client, storage, formatters, hooks, rarity, pricing,
                      cardRecognition, cardAssistant
  screens/            One file per route: Home, Detail, Library, Sets, Scan, Profile
  styles/             Global CSS + design tokens
  types/              Shared TypeScript types
```

---

## Known limitations

- Scanner is simulated (clearly labeled in Profile and in the result panel).
- Assistant is rule-based — supports 12 intents (rarity, value, set, owned, category, attacks, abilities, weaknesses/resistances, retreat, variants, recommendation, similar prints). Unknown questions fall back to a grounded summary.
- Library "view by expansion" is not yet implemented — sorting and filtering by rarity is.
- Missing-card placeholders inside a set view are not yet rendered.
- Card images come from the Pokémon TCG API CDN — if the CDN is slow, the first paint can lag. There is a small in-memory cache per session, but no service worker.
- No automated tests.

---

## License

This is a non-commercial personal project. The source code is yours to study and adapt; Pokémon, Pokémon character names, and card artwork are the property of Nintendo, The Pokémon Company, Creatures Inc., and Game Freak.
