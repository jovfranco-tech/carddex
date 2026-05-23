/**
 * CardDex i18n — Lightweight internationalization system.
 *
 * Zero external dependencies. Detects the browser locale and provides
 * a `t(key)` function for string lookup with optional interpolation.
 *
 * Usage:
 *   import { useI18n } from '@/lib/i18n';
 *   const { t, locale, setLocale } = useI18n();
 *   <h1>{t('home.title')}</h1>
 *   <p>{t('home.cardCount', { count: 42 })}</p>
 *
 * Supported locales: 'es' (default), 'en'
 * Adding a new locale: add a JSON file in src/locales/<code>.json
 * and register it in the `LOCALES` map below.
 */

import { useState, useCallback, useSyncExternalStore } from 'react';

// Import locale JSON bundles
import esStrings from '@/locales/es.json';
import enStrings from '@/locales/en.json';

export type SupportedLocale = 'es' | 'en';

const LOCALES: Record<SupportedLocale, Record<string, string>> = {
  es: esStrings,
  en: enStrings,
};

const STORAGE_KEY = 'carddex.locale.v1';

/** Detect the best supported locale from the browser. */
function detectLocale(): SupportedLocale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as SupportedLocale | null;
    if (saved && saved in LOCALES) return saved;
  } catch {}

  const browserLocales = navigator.languages ?? [navigator.language ?? 'es'];
  for (const lang of browserLocales) {
    const code = lang.slice(0, 2).toLowerCase() as SupportedLocale;
    if (code in LOCALES) return code;
  }
  return 'es';
}

/* -------------------------------------------------------------------------- */
/* Store — simple pub/sub so all useI18n() hooks share the same locale state  */
/* -------------------------------------------------------------------------- */

let _locale: SupportedLocale = 'es'; // populated lazily on first call
let _initialized = false;
const _subscribers = new Set<() => void>();

function getLocale(): SupportedLocale {
  if (!_initialized) {
    _initialized = true;
    _locale = detectLocale();
  }
  return _locale;
}

function setLocaleGlobal(next: SupportedLocale): void {
  if (next === _locale) return;
  _locale = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {}
  _subscribers.forEach((fn) => fn());
}

function subscribeLocale(fn: () => void): () => void {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

/* -------------------------------------------------------------------------- */
/* Translation helper                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Look up a translation key. Interpolates `{{key}}` placeholders.
 * Falls back to the `es` bundle if the key is missing in the active locale.
 * Falls back to the raw key string if missing in both bundles.
 */
function translate(
  locale: SupportedLocale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const bundle = LOCALES[locale];
  const fallback = LOCALES['es'];
  let str = bundle[key] ?? fallback[key] ?? key;

  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
  }
  return str;
}

/* -------------------------------------------------------------------------- */
/* React hook                                                                  */
/* -------------------------------------------------------------------------- */

export function useI18n() {
  // useSyncExternalStore keeps all hook instances in sync without Context
  const locale = useSyncExternalStore(subscribeLocale, getLocale, () => 'es' as SupportedLocale);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string =>
      translate(locale, key, vars),
    [locale],
  );

  const setLocale = useCallback((next: SupportedLocale) => {
    setLocaleGlobal(next);
  }, []);

  return { t, locale, setLocale };
}

/**
 * Non-hook version for use outside React components (utils, constants, etc.).
 * Note: does NOT react to locale changes.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  return translate(getLocale(), key, vars);
}

export { getLocale, setLocaleGlobal as setLocale };
export type { SupportedLocale as Locale };
