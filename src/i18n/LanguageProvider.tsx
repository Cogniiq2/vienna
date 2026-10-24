import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LANGUAGE, dictionaries, LANGUAGES, type Language } from '../content';
import { safeStorage } from '../lib/safeStorage';
import { LanguageContext, type LanguageContextValue } from './context';

const STORAGE_KEY = 'vienna:lang';

function readStoredLanguage(): Language {
  const stored = safeStorage.get(STORAGE_KEY);
  return LANGUAGES.includes(stored as Language) ? (stored as Language) : DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(readStoredLanguage);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    safeStorage.set(STORAGE_KEY, next);
  }, []);

  const t = dictionaries[lang];

  useEffect(() => {
    if (window.location.pathname.startsWith('/admin')) return; // Admin setzt eigenen Titel
    document.documentElement.lang = t.meta.htmlLang;
    document.title = t.meta.documentTitle;
  }, [t]);

  const value = useMemo<LanguageContextValue>(() => ({ lang, t, setLang }), [lang, t, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
