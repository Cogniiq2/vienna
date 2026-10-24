import { createContext, useContext } from 'react';
import type { LocalizedOrPlain } from '../config/trip';
import type { Dictionary, Language } from '../content';

export interface LanguageContextValue {
  lang: Language;
  t: Dictionary;
  setLang: (lang: Language) => void;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return ctx;
}

export function localize(value: LocalizedOrPlain, lang: Language): string {
  return typeof value === 'string' ? value : value[lang];
}
