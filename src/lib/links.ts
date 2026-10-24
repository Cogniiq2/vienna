import { trip } from '../config/trip';

/** Nur sichere, vollständige Links rendern – keine leeren oder javascript:-Links. */
export function safeHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  try {
    const url = new URL(v);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Fallback-Navigation aus einer Adresse (Google Maps öffnet auf iOS/Android die passende App). */
export function mapsSearchUrl(address: string | null | undefined): string | null {
  if (!address?.trim()) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

export function navigationHref(explicit: string | null, address: string | null): string | null {
  return safeHref(explicit) ?? mapsSearchUrl(address);
}

/** Route für den kurzen Wien-Spaziergang (Google Maps öffnet auf iOS/Android die Karten-App). */
export function routeUrl(): string | null {
  const w = trip.viennaWalk;
  const explicit = safeHref(w.destination.navigationUrl);
  if (explicit) return explicit;
  const destination = w.destination.address ?? w.destination.name;
  if (!destination) return null;
  const params = new URLSearchParams({ api: '1', destination, travelmode: w.travelMode });
  if (w.origin) params.set('origin', w.origin);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

