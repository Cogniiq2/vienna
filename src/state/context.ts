import { createContext, useContext, useSyncExternalStore } from 'react';
import type { TripState, TripStore } from './tripStore';

export const TripContext = createContext<TripStore | null>(null);

export function useTripStore(): TripStore {
  const store = useContext(TripContext);
  if (!store) throw new Error('useTripStore must be used inside <TripProvider>');
  return store;
}

export function useTripState(): TripState {
  const store = useTripStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
