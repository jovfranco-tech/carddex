# CardDex

**v1.1.3**

Production URL: [https://carddex-coral.vercel.app](https://carddex-coral.vercel.app)

CardDex is a mobile-first personal Pokémon TCG CardDex: search, scan, collect and understand Pokémon TCG cards with an AI-native Card Assistant. It is built with React, Vite and TypeScript, uses the public [Pokémon TCG API](https://pokemontcg.io/) as the card source of truth, and stores the user's collection locally by default.

> Personal fan project. Not affiliated with Nintendo, The Pokémon Company, Creatures Inc., or Game Freak.

## Features

- Card search, detail pages, sets, rarity badges, prices and collection states.
- Local collection with owned, quantity, favorite, wishlist, missing, condition, foil and variant metadata.
- Library modes for grid, list, binder and by-expansion progress.
- Scanner UI with camera permission handling, gallery fallback, manual correction and local assisted fallback.
- Contextual Card Assistant grounded in the selected card, Pokémon TCG API data and collection metadata.
- Local/demo profile, optional Supabase cloud sync, import/export and privacy boundaries.
- Lazy-loaded routes, image fallbacks, virtualized large lists and defensive storage parsing.

## Demo Boundaries

- **Pokémon TCG API:** Frontend uses public unauthenticated requests by default. This avoids shipping API keys in the browser. A server-only `POKEMON_TCG_API_KEY` can be used by serverless endpoints that need higher limits.
- **Scanner status:** Assisted/prototype by default. Camera video is not stored. Captures are processed locally unless `VITE_SCANNER_OCR_MODE=server` and `ENABLE_SERVER_AI_FEATURES=true` are enabled, in which case `/api/recognize` may call OpenAI with `OPENAI_API_KEY` stored only on the server.
- **Vector recognition:** Disabled prototype. `/api/recognize-vector` returns 501 instead of mock high-confidence matches.
- **Assistant status:** Deterministic local demo by default. Set `VITE_CARD_ASSISTANT_MODE=server` plus `ENABLE_SERVER_AI_FEATURES=true` to call `/api/card-assistant`; no LLM key is exposed to the frontend.
- **Prices:** Estimated from public market fields when available. They are references only, not financial advice.
- **Profile/auth:** Supabase is optional. Without Supabase, CardDex shows a local demo profile. Passkey local stores only a device marker/credential id, never a password.
- **Telemetry:** Disabled by default. Server telemetry requires both `VITE_TELEMETRY_MODE=server` and `ENABLE_TELEMETRY=true`, and stores sanitized messages without stack traces, user agent or raw IP.

## Security & Privacy Notes

- Do not put OpenAI, Anthropic, Gemini or Pokémon TCG API keys in `VITE_*` variables. Browser-exposed env vars are public by design.
- `.env`, `.env.local` and `*.local` are ignored by git. `.env.example` intentionally uses empty placeholders only.
- Collection, decks, preferences, cached card data, OCR cache and optional push subscription backup are stored locally in this browser. They are not uploaded unless Supabase/cloud sync or server OCR/LLM modes are explicitly configured.
- Camera access is requested only on the scanner screen. Closing or unmounting the scanner stops video tracks. Captured images are not stored by default.
- Serverless endpoints use rate limiting, hashed client identifiers and payload caps. For public production with LLM/OCR enabled, configure Vercel KV or a server-only Supabase service role key.
- Rendering is React text rendering only; CardDex does not use `dangerouslySetInnerHTML` for assistant responses or API content.
- `vercel.json` defines baseline production headers: CSP, frame blocking, HSTS, `nosniff`, referrer policy and camera-focused Permissions Policy.

## Run Locally

```bash
npm install
npm run dev
```

Vite runs at `http://localhost:5173` by default.

## Build And Test

```bash
npm run build
npm run typecheck
npm run test:run
npm run preview
```

There is no `npm run lint` script in this project yet.

## Environment Variables

Copy `.env.example` to `.env.local` for local development:

```bash
cp .env.example .env.local
```

```env
VITE_POKEMON_TCG_API_BASE_URL=https://api.pokemontcg.io/v2
POKEMON_TCG_API_KEY=

VITE_CARD_ASSISTANT_MODE=local
VITE_SCANNER_OCR_MODE=local
VITE_SCANNER_VECTOR_MODE=disabled
VITE_SYNERGY_FEED_MODE=local
VITE_TELEMETRY_MODE=local
ENABLE_SERVER_AI_FEATURES=false
OPENAI_API_KEY=
ENABLE_TELEMETRY=false
RATE_LIMIT_SALT=
KV_REST_API_URL=
KV_REST_API_TOKEN=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Use `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `KV_REST_API_TOKEN` and `RATE_LIMIT_SALT` only in Vercel/serverless environments. Do not create `VITE_OPENAI_*`, `VITE_ANTHROPIC_*` or similar client-exposed model keys.

## Deploy To Vercel

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- SPA rewrites and security headers live in `vercel.json`

Optional server-side env vars for enhanced demo mode:

- `ENABLE_SERVER_AI_FEATURES=true`
- `OPENAI_API_KEY`
- `POKEMON_TCG_API_KEY`
- `RATE_LIMIT_SALT`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `VITE_CARD_ASSISTANT_MODE=server`
- `VITE_SCANNER_OCR_MODE=server`
- `VITE_SYNERGY_FEED_MODE=server`
- `VITE_TELEMETRY_MODE=server`
- `ENABLE_TELEMETRY=true`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Project Structure

```text
src/
  app/          Router and app shell
  components/   Shared UI components
  lib/          API, storage, scanner, assistant, pricing and hooks
  screens/      Route-level screens
  styles/       Global CSS and design tokens
  types/        Shared TypeScript types
api/            Vercel serverless endpoints
e2e/            Playwright flows
```

## Roadmap

- Real server-side image/vector recognition backed by a trusted catalog.
- Backend-backed passkey verification and account sync.
- Supabase Auth/profile rollout with clearer migration from local profile.
- Authenticated backend rate limiting for expensive LLM/OCR endpoints after real auth lands.
- More robust pagination/search filters for very large set browsing.
- Add ESLint/format scripts to formalize lint checks.

## License

Non-commercial personal project. Pokémon names, trademarks and card artwork belong to their respective owners.
