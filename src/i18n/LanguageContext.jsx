import { createContext, useContext, useCallback, useMemo } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';

// Homegrown i18n — deliberately dependency-free to fit the app's local-first,
// minimal-deps posture. Locale dictionaries are plain JSON with dot-path keys.
// `en` is the source of truth; other locales fall back to it, and any missing
// key falls back to the key string itself so the UI never renders blank.

const DICTS = { en, es, fr };

// Resolve a dot-path ('nav.dashboard') against a nested dict. Returns undefined
// if any segment is missing so the caller can fall back.
function lookup(dict, key) {
  const parts = key.split('.');
  let cur = dict;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

// Pure translate helper, exported for unit testing without a React tree.
export function translate(lang, key) {
  const dict = DICTS[lang] || DICTS.en;
  const hit = lookup(dict, key);
  if (hit !== undefined) return hit;
  const fallback = lookup(DICTS.en, key);
  return fallback !== undefined ? fallback : key;
}

const LanguageContext = createContext({
  lang: 'en',
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }) {
  const lang = useSettingsStore((s) => s.locale.lang);
  const setLang = useSettingsStore((s) => s.setLang);

  const t = useCallback((key) => translate(lang, key), [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

// Convenience hook when a component only needs the translate function.
export function useT() {
  return useContext(LanguageContext).t;
}
