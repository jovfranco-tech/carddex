# Changelog

All notable changes to this project will be documented in this file.

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
