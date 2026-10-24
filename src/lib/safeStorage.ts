/**
 * localStorage-Wrapper, der in Private Mode / bei vollem Speicher nicht wirft.
 */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): boolean {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  getJson<T>(key: string): T | null {
    const raw = safeStorage.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setJson(key: string, value: unknown): boolean {
    return safeStorage.set(key, JSON.stringify(value));
  },
  /** Entfernt alle Keys mit einem Präfix. */
  removePrefix(prefix: string): void {
    try {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key?.startsWith(prefix)) keys.push(key);
      }
      keys.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  },
};
