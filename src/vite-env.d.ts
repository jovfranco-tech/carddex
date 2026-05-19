/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POKEMON_TCG_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
/// <reference types="vite-plugin-pwa/client" />
