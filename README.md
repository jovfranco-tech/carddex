# CardDex

**v1.1.0**

Production URL: [https://carddex-coral.vercel.app](https://carddex-coral.vercel.app)
A mobile-first personal Pokémon TCG collection app. CardDex is a digital binder, scanner, library, set browser, and contextual card assistant — built as a single React + Vite + TypeScript SPA. Card data comes from the public [Pokémon TCG API](https://pokemontcg.io/); your collection lives in your browser's LocalStorage.

> **Personal fan project — not affiliated with Nintendo, The Pokémon Company, Creatures Inc., or Game Freak.** All trademarks and rights belong to their respective owners.

---

## What's real vs. simulated

**Real**
- Card search via the Pokémon TCG API
- Card detail (attacks, abilities, weaknesses, resistances, retreat cost, flavor text, artist, …)
- Set list, set symbol, set series, release date, printed total
- Set completion progress derived from your collection (viewable in the new "By Expansion" library mode)
- LocalStorage collection — favorites, wishlist, quantity, foil, condition, variant, language, notes
- Recently viewed list
- Estimated value from TCGPlayer (USD) with Cardmarket (EUR) as fallback
- Real-time scanner via OpenAI Vision API (if `OPENAI_API_KEY` is configured).

**Simulated / assisted**
- Scanner fallback — If the OpenAI API key is missing or fails, the scanner falls back to an assisted demo mode that rotates through a small set of popular card names and queries the real API. UI clearly labels when this happens so it does not falsely present simulated recognition as real OCR.
- Card Assistant — `lib/cardAssistant.ts` is a deterministic, rule-based answer engine grounded in card data, collection metadata, and pricing. **No LLM is called from the frontend.** Every answer maps to a specific field on `CardAssistantContext`; missing data is reported as missing, never invented.
- Price Trends — The 6-month historical chart generates a deterministic curve based on the card's ID, visually simulating a market trend using current price data.

**Future (v2)**
- On-device image-hash matching against a precomputed catalog.
- Optional serverless `/api/card-assistant` endpoint for a real LLM, with the same `CardAssistantContext` as the grounding input.
- Multi-language card support (ES / JP / IT).
- PWA shell + install prompt.

---

## Tech stack

- React 18 + TypeScript 5
- Vite 5 + Vitest
- React Router 6
- Virtualized lists (`react-virtuoso`) for massive collection performance.
- Capacitor (iOS/Android native support ready).
- No CSS framework — design tokens in `src/styles/tokens.css`, all components use inline styles + CSS variables.

---

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173
```

### Optional Configurations

The Pokémon TCG API works unauthenticated but has a tight rate limit. 
Supabase cloud sync is optional / experimental. The app runs on LocalStorage by default and will not crash if Supabase is missing.

Copy `.env.example` to `.env.local` and fill it in:

```bash
cp .env.example .env.local
```

```env
VITE_POKEMON_TCG_API_BASE_URL=https://api.pokemontcg.io/v2
VITE_POKEMON_TCG_API_KEY=your_key_here

OPENAI_API_KEY=your_vision_key_here # For Real OCR

VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Get a free key at [dev.pokemontcg.io](https://dev.pokemontcg.io/). The key is read at build time via Vite's `import.meta.env` and sent as the `X-Api-Key` header. It is never logged, persisted, or exposed in storage.

---

## Build & Test

```bash
npm run typecheck    # tsc -b --noEmit
npm run build        # tsc -b && vite build
npm run test:run     # Run Vitest test suite
npm run preview      # preview the production build locally
```

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

- Assistant is rule-based — supports 12 intents. Unknown questions fall back to a grounded summary.
- Card images come from the Pokémon TCG API CDN — if the CDN is slow, the first paint can lag. There is a small in-memory cache per session, but no service worker.

---

## License

This is a non-commercial personal project. The source code is yours to study and adapt; Pokémon, Pokémon character names, and card artwork are the property of Nintendo, The Pokémon Company, Creatures Inc., and Game Freak.
