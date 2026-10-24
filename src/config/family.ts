/**
 * Alles Persönliche an einem Ort: Namen, Familienfotos, Video, Sprachnachrichten, Musik.
 *
 * ASSETS (alte Fotos, Video, Audios) – zwei Wege:
 *   1. EMPFOHLEN (privat): im Admin-Dashboard (/admin → „Familien-Assets“) hochladen.
 *      Die Dateien landen im privaten Supabase-Bucket `family` und werden nur per
 *      kurzlebiger, signierter URL an Mitglieder des Trips ausgeliefert. Hier dann nichts eintragen.
 *   2. Lokal / Demo: `src` auf eine URL setzen (z. B. "/family/hochzeit.jpg" in /public).
 *      ACHTUNG: Dateien in /public sind öffentlich abrufbar.
 *   Ein im Dashboard hochgeladenes Asset hat Vorrang vor `src`.
 *
 * Fehlt ein Asset, wird die jeweilige Stelle einfach ruhig weggelassen – nie ein leerer Rahmen.
 * MUSIK: nur Streaming-Links, keine Audiodateien bündeln. Leere Einträge werden nicht angezeigt.
 */

import type { Localized } from './trip';

export type AssetSlot =
  | 'gradskiKlub'
  | 'wedding'
  | 'familyEarly'
  | 'familyCurrent'
  | 'parentsNow'
  | 'familyVideo'
  | 'familyVideoPoster'
  | 'audioDjordje'
  | 'audioBogdana'
  | 'audioLazar';

export const ASSET_SLOTS: readonly AssetSlot[] = [
  'gradskiKlub',
  'wedding',
  'familyEarly',
  'familyCurrent',
  'parentsNow',
  'familyVideo',
  'familyVideoPoster',
  'audioDjordje',
  'audioBogdana',
  'audioLazar',
];

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
  memoryAssets: Record<'gradskiKlub' | 'wedding' | 'familyEarly' | 'familyCurrent' | 'parentsNow', MemoryAsset>;
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

  memoryAssets: {
    // Ihr erstes gemeinsames Café. year/location ergänzen, wenn bekannt (z. B. year: '1989').
    gradskiKlub: asset({ sr: 'Градски клуб', de: 'Gradski Klub' }),
    wedding: asset(),
    // Kinder klein / gemeinsamer Urlaub
    familyEarly: asset(),
    // Eltern + drei Kinder heute
    familyCurrent: asset(),
    // Optional: aktuelles Foto nur von Mama & Tata. Fehlt es, wird das heutige Dinner-Foto verwendet.
    parentsNow: asset(),
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
