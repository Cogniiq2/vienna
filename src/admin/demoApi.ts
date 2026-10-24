import { createPlaceholderPhoto } from '../lib/image';
import type { AdminApi, AdminTrip } from './types';

/** Nur Entwicklung (/admin?demo=1): Dashboard mit Beispieldaten ansehen, ohne Supabase. */
export function createDemoAdminApi(): AdminApi {
  const now = Date.now();
  const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
  const trip: AdminTrip = {
    trip_id: 'demo-trip',
    label: 'Mama & Tata · Wien 27.10.2026',
    created_at: iso(60 * 24 * 3),
    phase: 'journey',
    completed: ['morning', 'mission', 'vienna'],
    seen: ['interlude:gradskiKlub', 'interlude:wedding', 'interlude:family'],
    current_chapter: 3,
    started_at: iso(300),
    finished_at: null,
    updated_at: iso(2),
    members: [
      { device: 'iPhone · Safari', joined_at: iso(310), last_seen_at: iso(1) },
      { device: 'iPhone · Safari', joined_at: iso(200), last_seen_at: iso(25) },
    ],
    uploads_detail: [
      { chapter_id: 'morning', path: 'demo/morning.jpg', captured_at: iso(290), uploaded_at: iso(289) },
      { chapter_id: 'mission', path: 'demo/mission.jpg', captured_at: iso(200), uploaded_at: iso(170) },
    ],
    responses: [
      { question_id: 'morning.firstAwake', value: 'father', updated_at: iso(280) },
      { question_id: 'morning.noWork', value: 'try', updated_at: iso(279) },
    ],
    messages: [{ id: 'm1', body: 'Добро јутро! Уживајте. ❤️', heart: true, created_at: iso(240), read_at: iso(230) }],
    assets: [],
  };
  const urls = new Map<string, string>();
  let changed: (() => void) | null = null;

  return {
    overview: () => Promise.resolve([structuredClone(trip)]),
    async signedPhotoUrls(paths) {
      const out: Record<string, string> = {};
      for (const [i, path] of paths.entries()) {
        if (!urls.has(path)) urls.set(path, URL.createObjectURL((await createPlaceholderPhoto(path.split('/')[1] ?? path, i)).blob));
        out[path] = urls.get(path) ?? '';
      }
      return out;
    },
    signedAssetUrl: () => Promise.resolve(null),
    sendMessage(_tripId, body, heart) {
      trip.messages = [...(trip.messages ?? []), { id: `m${Date.now()}`, body, heart, created_at: new Date().toISOString(), read_at: null }];
      changed?.();
      return Promise.resolve();
    },
    deleteMessage(id) {
      trip.messages = (trip.messages ?? []).filter((m) => m.id !== id);
      changed?.();
      return Promise.resolve();
    },
    uploadAsset(_tripId, slot, file) {
      trip.assets = [...(trip.assets ?? []).filter((a) => a.slot !== slot), { slot, path: file.name, mime: file.type }];
      changed?.();
      return Promise.resolve();
    },
    removeAsset(_tripId, slot) {
      trip.assets = (trip.assets ?? []).filter((a) => a.slot !== slot);
      changed?.();
      return Promise.resolve();
    },
    subscribe(onChange, onStatus) {
      changed = onChange;
      onStatus(true);
      return () => {
        changed = null;
      };
    },
  };
}
