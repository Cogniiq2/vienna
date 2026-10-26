import { createPlaceholderPhoto } from '../lib/image';
import type { AdminApi, AdminTrip } from './types';

/** Nur Entwicklung (/admin?demo=1): Dashboard mit Beispieldaten ansehen, ohne Supabase. Alles im Speicher. */
export function createDemoAdminApi(): AdminApi {
  const now = Date.now();
  const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
  const trip: AdminTrip = {
    trip_id: 'demo-trip',
    label: 'Mama & Tata · Wien 27.10.2026',
    created_at: iso(60 * 24 * 3),
    phase: 'journey',
    completed: ['morning', 'mission'],
    seen: [],
    current_chapter: 2,
    started_at: iso(300),
    finished_at: null,
    updated_at: iso(2),
    members: [
      { device: 'iPhone · Safari', joined_at: iso(310), last_seen_at: iso(1) },
      { device: 'iPhone · Safari', joined_at: iso(200), last_seen_at: iso(25) },
    ],
    uploads: [
      { chapter_id: 'morning', path: 'demo/day/morning.jpg', captured_at: iso(290), uploaded_at: iso(289) },
      { chapter_id: 'mission', path: 'demo/day/mission.jpg', captured_at: iso(200), uploaded_at: iso(170) },
    ],
    answers: [
      { question_id: 'morning.firstAwake', value: 'father', updated_at: iso(280) },
      { question_id: 'morning.noWork', value: 'try', updated_at: iso(279) },
    ],
    messages: [{ id: 'm1', body: 'Добро јутро! Уживајте. ❤️', heart: true, created_at: iso(240), read_at: iso(230) }],
    assets: [
      { slot: 'familyCurrent', path: 'demo/family/familyCurrent.jpg', mime: 'image/jpeg', updated_at: iso(600) },
      { slot: 'gradskiKlub', path: null, mime: null, caption_sr: 'Градски клуб', caption_de: 'Gradski Klub', updated_at: iso(500) },
    ],
  };
  const urls = new Map<string, string>();
  let changed: (() => void) | null = null;
  const notify = () => changed?.();

  return {
    overview: () => Promise.resolve([structuredClone(trip)]),
    async signedUrls(paths) {
      const out: Record<string, string> = {};
      for (const [i, path] of paths.entries()) {
        if (!urls.has(path)) urls.set(path, URL.createObjectURL((await createPlaceholderPhoto(path.split('/').pop() ?? path, i)).blob));
        out[path] = urls.get(path) ?? '';
      }
      return out;
    },
    sendMessage(_tripId, body, heart) {
      trip.messages = [...(trip.messages ?? []), { id: `m${Date.now()}`, body, heart, created_at: new Date().toISOString(), read_at: null }];
      notify();
      return Promise.resolve();
    },
    deleteMessage(id) {
      trip.messages = (trip.messages ?? []).filter((m) => m.id !== id);
      notify();
      return Promise.resolve();
    },
    uploadAsset(_tripId, slot, file) {
      const path = `demo/${slot}/${Date.now()}-${file.name}`;
      urls.set(path, URL.createObjectURL(file));
      const existing = trip.assets.find((a) => a.slot === slot);
      trip.assets = [
        ...trip.assets.filter((a) => a.slot !== slot),
        { ...existing, slot, path, mime: file.type, updated_at: new Date().toISOString() },
      ];
      notify();
      return Promise.resolve();
    },
    updateAssetMeta(_tripId, slot, meta) {
      const existing = trip.assets.find((a) => a.slot === slot) ?? { slot, path: null, mime: null };
      trip.assets = [
        ...trip.assets.filter((a) => a.slot !== slot),
        {
          ...existing,
          caption_sr: meta.captionSr || null,
          caption_de: meta.captionDe || null,
          year: meta.year || null,
          location: meta.location || null,
          note: meta.note || null,
          updated_at: new Date().toISOString(),
        },
      ];
      notify();
      return Promise.resolve();
    },
    removeAsset(_tripId, slot) {
      trip.assets = trip.assets.map((a) => (a.slot === slot ? { ...a, path: null, mime: null } : a));
      notify();
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
