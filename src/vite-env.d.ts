/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POKEMON_TCG_API_BASE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_CARD_ASSISTANT_MODE?: 'local' | 'server';
  readonly VITE_SCANNER_OCR_MODE?: 'local' | 'server';
  readonly VITE_SCANNER_VECTOR_MODE?: 'disabled' | 'server';
  readonly VITE_SYNERGY_FEED_MODE?: 'local' | 'server';
  readonly VITE_TELEMETRY_MODE?: 'local' | 'server';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
/// <reference types="vite-plugin-pwa/client" />
