import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ChapterId } from '../config/chapters';
import type { AssetSlot } from '../config/family';
import type { PhotoEntry, TripStore } from '../state/tripStore';

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(reducedMotionQuery);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  );
}

/**
 * Liefert eine anzeigbare URL für das Foto eines Kapitels (lokal oder vom Server)
 * und räumt Object-URLs automatisch auf.
 */
export function usePhotoUrl(
  store: TripStore,
  chapterId: ChapterId,
  entry: PhotoEntry | undefined,
): { url: string | null; loading: boolean } {
  const [result, setResult] = useState<{ key: string; url: string | null } | null>(null);
  const key = entry ? `${chapterId}:${entry.capturedAt}:${entry.hasLocal ? 'l' : 'r'}` : '';

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    store
      .getPhotoBlob(chapterId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = blob ? URL.createObjectURL(blob) : null;
        setResult({ key, url: objectUrl });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, url: null });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [store, chapterId, key]);

  if (!key) return { url: null, loading: false };
  if (result?.key !== key) return { url: null, loading: true };
  return { url: result.url, loading: false };
}

/** URL eines Familien-Assets (privat signiert oder konfiguriert). `null` = nicht vorhanden. */
export function useAssetUrl(store: TripStore, slot: AssetSlot | null): { url: string | null; loading: boolean } {
  const { assets } = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const remotePath = slot ? (assets[slot]?.path ?? '') : '';
  const key = slot ? `${slot}:${remotePath}:${store.hasAsset(slot) ? 1 : 0}` : '';
  const [result, setResult] = useState<{ key: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!slot || !key) return;
    let cancelled = false;
    store
      .getAssetUrl(slot)
      .then((url) => {
        if (!cancelled) setResult({ key, url });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, url: null });
      });
    return () => {
      cancelled = true;
    };
  }, [store, slot, key]);

  if (!slot || !store.hasAsset(slot)) return { url: null, loading: false };
  if (result?.key !== key) return { url: null, loading: true };
  return { url: result.url, loading: false };
}
