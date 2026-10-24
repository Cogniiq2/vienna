import { createStore, del, entries, get, set, type UseStore } from 'idb-keyval';
import type { ChapterId } from '../config/chapters';

/**
 * Lokale Foto-Ablage in IndexedDB. Jedes Foto wird ZUERST hier gespeichert,
 * danach (wenn möglich) hochgeladen. So geht im Stadion mit schlechtem Netz nichts verloren
 * und das PDF kann auch offline erzeugt werden.
 *
 * Bytes werden als ArrayBuffer gespeichert (robuster als Blob in älteren Safari-Versionen).
 * Fällt IndexedDB aus (sehr alte Browser / restriktive Modi), wird für die Sitzung im Speicher gehalten.
 */

export type PhotoSyncStatus = 'pending' | 'synced' | 'local';

export interface StoredPhoto {
  tripKey: string;
  chapterId: ChapterId;
  bytes: ArrayBuffer;
  mimeType: string;
  width: number;
  height: number;
  capturedAt: string;
  status: PhotoSyncStatus;
  remotePath: string | null;
}

export type PhotoMeta = Omit<StoredPhoto, 'bytes'>;

let store: UseStore | null = null;
let idbBroken = false;
const memory = new Map<string, StoredPhoto>();

function getStore(): UseStore | null {
  if (idbBroken || typeof indexedDB === 'undefined') return null;
  store ??= createStore('vienna-gift', 'photos');
  return store;
}

function keyOf(tripKey: string, chapterId: ChapterId): string {
  return `${tripKey}:${chapterId}`;
}

async function withIdb<T>(op: (s: UseStore) => Promise<T>, fallback: () => T): Promise<T> {
  const s = getStore();
  if (!s) return fallback();
  try {
    return await op(s);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') throw error;
    idbBroken = true;
    return fallback();
  }
}

export const photoStore = {
  async put(photo: StoredPhoto): Promise<void> {
    const key = keyOf(photo.tripKey, photo.chapterId);
    memory.set(key, photo);
    await withIdb(
      (s) => set(key, photo, s),
      () => undefined,
    );
  },

  async get(tripKey: string, chapterId: ChapterId): Promise<StoredPhoto | null> {
    const key = keyOf(tripKey, chapterId);
    const fromIdb = await withIdb(
      async (s) => (await get<StoredPhoto>(key, s)) ?? null,
      () => null,
    );
    return fromIdb ?? memory.get(key) ?? null;
  },

  async list(tripKey: string): Promise<StoredPhoto[]> {
    const prefix = `${tripKey}:`;
    const fromIdb = await withIdb(
      async (s) => (await entries<string, StoredPhoto>(s)).filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
      () => [] as StoredPhoto[],
    );
    const byChapter = new Map<ChapterId, StoredPhoto>();
    for (const [k, v] of memory) if (k.startsWith(prefix)) byChapter.set(v.chapterId, v);
    for (const v of fromIdb) byChapter.set(v.chapterId, v);
    return [...byChapter.values()];
  },

  async update(tripKey: string, chapterId: ChapterId, patch: Partial<Pick<StoredPhoto, 'status' | 'remotePath'>>) {
    const existing = await photoStore.get(tripKey, chapterId);
    if (!existing) return;
    await photoStore.put({ ...existing, ...patch });
  },

  async remove(tripKey: string, chapterId: ChapterId): Promise<void> {
    const key = keyOf(tripKey, chapterId);
    memory.delete(key);
    await withIdb(
      (s) => del(key, s),
      () => undefined,
    );
  },

  async clearTrip(tripKey: string): Promise<void> {
    const photos = await photoStore.list(tripKey);
    await Promise.all(photos.map((p) => photoStore.remove(tripKey, p.chapterId)));
  },
};

export function toMeta(photo: StoredPhoto): PhotoMeta {
  const { bytes: _bytes, ...meta } = photo;
  void _bytes;
  return meta;
}
