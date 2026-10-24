import { env } from './env';

const KEY = 'vienna:debug';

/** Debug-Panel aktiv? Nur wenn verfügbar (Dev oder VITE_ENABLE_DEBUG) UND per ?debug=true angefordert. */
export function isDebugRequested(search: string): boolean {
  if (!env.debugAvailable) return false;
  const param = new URLSearchParams(search).get('debug');
  try {
    if (param === 'true' || param === '1') window.sessionStorage.setItem(KEY, '1');
    if (param === 'false' || param === '0') window.sessionStorage.removeItem(KEY);
    return window.sessionStorage.getItem(KEY) === '1';
  } catch {
    return param === 'true' || param === '1';
  }
}
