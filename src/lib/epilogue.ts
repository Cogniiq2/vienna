import { trip } from '../config/trip';

const FORCE_KEY = 'vienna:epilogue-force';

/** Der Epilog erscheint am Morgen nach dem großen Tag (oder im Debug-Modus sofort). */
export function isEpilogueAvailable(now: number = Date.now()): boolean {
  if (isEpilogueForced()) return true;
  const from = Date.parse(trip.epilogue.availableFrom);
  return Number.isFinite(from) && now >= from;
}

export function isEpilogueForced(): boolean {
  try {
    return window.sessionStorage.getItem(FORCE_KEY) === '1';
  } catch {
    return false;
  }
}

export function forceEpilogue(): void {
  try {
    window.sessionStorage.setItem(FORCE_KEY, '1');
  } catch {
    /* ignore */
  }
}
