import { useEffect, useState, type ReactNode } from 'react';
import { useLanguage } from '../i18n/context';
import { createBackend } from '../lib/backend';
import { TripContext } from './context';
import { TripStore } from './tripStore';

export function TripProvider({ token, children }: { token: string; children: ReactNode }) {
  const [store] = useState(() => new TripStore(token, createBackend(token)));
  const { lang } = useLanguage();

  useEffect(() => {
    void store.init();
    return () => store.dispose();
  }, [store]);

  useEffect(() => {
    store.setLanguage(lang);
  }, [store, lang]);

  return <TripContext.Provider value={store}>{children}</TripContext.Provider>;
}
