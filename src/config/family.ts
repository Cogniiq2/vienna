/**
 * Persönliches an einem Ort: Namen, Defaults für Familien-Assets, Musik.
 *
 * FAMILIEN-ASSETS (Fotos, Video, Audios) kommen aus der DATENBANK:
 *   /admin → „Familien-Assets“ → Datei hochladen (+ optional Bildunterschrift SR/DE, Jahr, Ort, Notiz).
 *   Kein Code, kein Commit, kein Redeploy. Dateien liegen privat im Bucket `vienna-memories`.
 *
 * Diese Datei liefert nur DEFAULTS. Priorität: Datenbank/Storage → Default hier → ausblenden.
 *   `src` hier nur für lokale Demos setzen (Dateien in /public sind öffentlich!).
 *
 * Fehlt ein Asset, wird die Stelle ruhig weggelassen – nie ein leerer Rahmen, kein „fehlt“ für Mama & Tata.
 * MUSIK: nur Streaming-Links, keine Audiodateien bündeln. Leere Einträge werden nicht angezeigt.
 */

import type { Localized } from './trip';

export type AssetSlot =
  | 'familyCurrent'
  | 'parentsCurrent'
  | 'gradskiKlub'
  | 'wedding'
  | 'familyEarly'
  | 'familyVideo'
  | 'videoPoster'
  | 'audioDjordje'
  | 'audioBogdana'
  | 'audioLazar';

/** Reihenfolge = Reihenfolge im Admin. Muss mit vienna.assets.slot (Migration) übereinstimmen. */
export const ASSET_SLOTS: readonly AssetSlot[] = [
  'familyCurrent',
  'parentsCurrent',
  'gradskiKlub',
  'wedding',
  'familyEarly',
  'familyVideo',
  'videoPoster',
  'audioDjordje',
  'audioBogdana',
  'audioLazar',
];

export type PhotoSlot = 'familyCurrent' | 'parentsCurrent' | 'gradskiKlub' | 'wedding' | 'familyEarly';
export const PHOTO_SLOTS: readonly PhotoSlot[] = ['familyCurrent', 'parentsCurrent', 'gradskiKlub', 'wedding', 'familyEarly'];

/** Welche Art Datei gehört in welchen Slot (Upload-Filter + Storage-Ordner). */
export function slotKind(slot: AssetSlot): 'image' | 'video' | 'audio' {
  if (slot === 'familyVideo') return 'video';
  if (slot.startsWith('audio')) return 'audio';
  return 'image';
}

export interface MemoryAsset {
  /** Optionaler direkter Pfad/URL (nur für Demo/Tests). Sonst im Admin-Dashboard hochladen. */
  src: string | null;
  caption: Localized | null;
  year: string | null;
  location: string | null;
}

export interface ChildMessage {
  slot: Extract<AssetSlot, 'audioDjordje' | 'audioBogdana' | 'audioLazar'>;
  /** „Од Ђорђа.“ */
  label: Localized;
  src: string | null;
  /** Optional: Abschrift für Barrierefreiheit (wird ausklappbar angezeigt). */
  transcript: Localized | null;
}

export interface MusicTrack {
  title: string;
  artist: string;
  spotifyUrl: string | null;
  appleMusicUrl: string | null;
  youtubeUrl: string | null;
}

export interface FamilyConfig {
  parents: {
    mother: { name: Localized; call: Localized };
    father: { name: Localized; call: Localized };
  };
  children: Array<{ id: 'djordje' | 'bogdana' | 'lazar'; name: Localized }>;
  memoryAssets: Record<PhotoSlot, MemoryAsset>;
  familyVideo: {
    src: string | null;
    poster: string | null;
    /** WebVTT-Untertitel (optional). */
    captionsSrc: string | null;
    transcript: Localized | null;
  };
  familyMessages: ChildMessage[];
  music: Record<'morning' | 'spa' | 'finale', MusicTrack | null>;
}

const asset = (caption: Localized | null = null): MemoryAsset => ({ src: null, caption, year: null, location: null });

export const family: FamilyConfig = {
  parents: {
    mother: { name: { sr: 'Милица', de: 'Milica' }, call: { sr: 'мама', de: 'Mama' } },
    father: { name: { sr: 'Милош', de: 'Miloš' }, call: { sr: 'тата', de: 'Tata' } },
  },

  children: [
    { id: 'djordje', name: { sr: 'Ђорђе', de: 'Đorđe' } },
    { id: 'bogdana', name: { sr: 'Богдана', de: 'Bogdana' } },
    { id: 'lazar', name: { sr: 'Лазар', de: 'Lazar' } },
  ],

  // Defaults – im Admin gepflegte Bildunterschriften/Jahre/Orte haben Vorrang.
  memoryAssets: {
    familyCurrent: asset(),
    // Fehlt dieses Foto, wird für „ви сте Милица и Милош.“ das heutige Dinner-Foto verwendet.
    parentsCurrent: asset(),
    gradskiKlub: asset({ sr: 'Градски клуб', de: 'Gradski Klub' }),
    wedding: asset(),
    familyEarly: asset(),
  },

  familyVideo: {
    src: null,
    poster: null,
    captionsSrc: null,
    transcript: null,
  },

  familyMessages: [
    { slot: 'audioDjordje', label: { sr: 'Од Ђорђа.', de: 'Von Đorđe.' }, src: null, transcript: null },
    { slot: 'audioBogdana', label: { sr: 'Од Богдане.', de: 'Von Bogdana.' }, src: null, transcript: null },
    { slot: 'audioLazar', label: { sr: 'Од Лазара.', de: 'Von Lazar.' }, src: null, transcript: null },
  ],

  music: {
    // z. B. { title: '…', artist: 'Здравко Чолић', spotifyUrl: 'https://open.spotify.com/track/…', appleMusicUrl: null, youtubeUrl: null }
    morning: null,
    spa: null,
    finale: null,
  },
};

/** Ein Track wird nur gezeigt, wenn er mindestens einen gültigen Link hat. */
export function hasMusicLinks(track: MusicTrack | null): track is MusicTrack {
  return Boolean(track && (track.spotifyUrl || track.appleMusicUrl || track.youtubeUrl));
}
