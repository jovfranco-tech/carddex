# Changelog

All notable changes to this project will be documented in this file.

## [1.1.3] - 2026-05-22

### Security
- Upgraded Vite/Vitest tooling to remove the remaining moderate `npm audit` advisory without forcing a broken install.
- Added explicit `ENABLE_SERVER_AI_FEATURES=true` opt-in before any serverless OpenAI endpoint can spend LLM/OCR/image-generation tokens.
- Hardened rate limiting with hashed client identifiers, HTTPS-only provider URLs and server-only Supabase service-role usage.
- Added rate limiter regression tests covering local fallback, hashed keys, Vercel KV keys and refusal to use browser anon keys for server rate limiting.
- Restricted server OCR/grading image endpoints to local `data:image/*` payloads instead of arbitrary external URLs.

### Documentation
- Documented Vercel KV, rate-limit salt, server AI opt-in and server-only Supabase service role variables.

## [1.1.2] - 2026-05-22

### Security
- Hardened `vercel.json` security headers with tighter script CSP, HSTS, frame blocking, worker/media policies and scoped camera Permissions Policy.
- Replaced `@vercel/node` type dependency with local minimal handler types to remove vulnerable transitive serverless tooling packages from the app install.
- Hardened `/api/image-proxy` with HTTPS-only allowlisting, nested `images.weserv.nl` target validation, redirect blocking, content-type checks, size limits and rate limiting.
- Added rate limiting and payload validation to `/api/recognize` and `/api/chat`.
- Disabled browser telemetry by default and sanitized server telemetry so it does not store stack traces, raw IPs, user agents or sensitive metadata.
- Removed camera/OCR-sensitive console output and push subscription endpoint logging.

### Privacy
- Sanitized local `.env.local` usage by removing client-exposed Pokémon TCG API key usage and documenting server-only key policy.
- Removed email metadata from passkey telemetry events.
- Documented local data storage, camera behavior, API key policy and known security limitations.

## [1.1.1] - 2026-05-22

### Fixed
- Removed frontend use of `VITE_POKEMON_TCG_API_KEY`; CardDex now defaults to public Pokémon TCG API access without bundling API keys.
- Removed localStorage password persistence from the passkey demo flow and migrated it to a local marker only.
- Stopped mock vector recognition from returning fake high-confidence matches.
- Added timeout handling for Pokémon TCG API requests.
- Ensured scanner camera streams are stopped and detached on close/unmount.
- Converted core card tiles and scanner correction picks to real button interactions.

### Changed
- Card Assistant, scanner, visual search and synergy copy now clearly describe local/demo/server modes.
- Optional LLM/OCR features are gated behind explicit backend mode flags.
- Profile now shows a local demo profile, privacy boundaries and clearer API/scanner/assistant status.
- Library grid is more responsive on narrow screens.

### Documentation
- Rewrote README with demo limits, privacy notes, environment variables, run/build commands and roadmap.

## [1.1.0] - 2026-05-19

### Added
- **Real OCR Scanner:** Vision API integration via serverless `/api/recognize.ts`. Falls back to an honest, label-assisted simulated mode when not configured.
- **Sets/Binder View:** Organized "By Expansion" library view that shows set completion progress.
- **Virtualization:** Native large-list rendering using `react-virtuoso` for 10k+ collections.
- **Capacitor Support:** Added native iOS & Android projects.
- **Deterministic Price Charting:** 6-month historical charts are now deterministically hashed by `card.id`.
- **Vitest Suite:** Implemented base test suite for rarity, pricing, Assistant, and recognition logic.

### Changed
- **Safe Supabase Initialization:** Profile and public features dynamically gracefully fail and show experimental banners when Supabase is unconfigured, making `localStorage` the reliable default.
- **AI Card Assistant:** Refined deterministic intent engine. Grounded in `CardAssistantContext` for future remote LLM support without frontend hallucination.
- Removed hard crashes when `VITE_SUPABASE_URL` is omitted.

## [1.0.1] - 2026-05-18

### Added
- Initial setup.
