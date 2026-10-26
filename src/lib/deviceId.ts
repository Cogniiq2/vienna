import { safeStorage } from './safeStorage';

const KEY = 'vienna:device-id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let memory: string | null = null;

function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Zufällige, lokal gespeicherte Geräte-ID (kein Login, keine personenbezogenen Daten).
 * Sie unterscheidet nur die beiden Handys im Dashboard und dient den Rate-Limits.
 * Geht sie verloren (Safari-Daten gelöscht), entsteht einfach eine neue – der Trip-Token genügt.
 */
export function getDeviceId(): string {
  if (memory) return memory;
  const stored = safeStorage.get(KEY);
  if (stored && UUID.test(stored)) {
    memory = stored;
    return stored;
  }
  const fresh = randomUuid();
  safeStorage.set(KEY, fresh);
  memory = fresh;
  return fresh;
}

/** Nur für Tests. */
export function resetDeviceIdCache(): void {
  memory = null;
}
