/**
 * Zentrale Reise-Konfiguration (Logistik). Persönliches steht in src/config/family.ts.
 *
 * Regeln:
 * - `null` bedeutet „noch nicht bekannt“. Die UI zeigt dann dezent „Биће допуњено“ / „Wird noch ergänzt“
 *   bzw. blendet die Zeile aus. Nichts wird erfunden.
 * - Texte, die übersetzt werden müssen, sind `Localized` ({ sr, de }). Eigennamen/Adressen sind Strings.
 * - Uhrzeiten "HH:MM" (Wiener Ortszeit). Links: vollständige https-URLs.
 * - Ohne Navigations-Link wird aus Adresse bzw. Name automatisch ein Google-Maps-Link gebaut.
 */

export type Localized = { sr: string; de: string };
export type LocalizedOrPlain = string | Localized;

export interface Place {
  name: string;
  address: string | null;
  navigationUrl: string | null;
}

export interface EpilogueLocation {
  name: string;
  /** Kurz: was ist das, warum lohnt es sich. */
  description: Localized;
  /** Optional: ein Satz Geschichte. */
  history: Localized | null;
  /** Optional: Weg/Dauer, z. B. { sr: '10 минута пешке', de: '10 Minuten zu Fuß' }. */
  walk: Localized | null;
  address: string | null;
  navigationUrl: string | null;
}

export interface TripConfig {
  date: string;
  timeZone: string;
  hotel: {
    name: string;
    room: LocalizedOrPlain | null;
    stay: LocalizedOrPlain | null;
    address: string | null;
    mapsUrl: string | null;
    gymNotes: LocalizedOrPlain | null;
    spaNotes: LocalizedOrPlain | null;
  };
  /** Epilog: kurzer Weg vom Hotel nach Schönbrunn (Navigation „Покажи пут“). */
  viennaWalk: {
    destination: Place;
    /** Startpunkt der Route; null = aktueller Standort. */
    origin: string | null;
    travelMode: 'walking' | 'transit';
  };
  viennaOpen: {
    eventName: string;
    venue: string | null;
    venueAddress: string | null;
    session: LocalizedOrPlain | null;
    entryTime: string | null;
    startTime: string | null;
    departureTime: string | null;
    seatInfo: LocalizedOrPlain | null;
    ticketUrl: string | null;
    /** Pfad unter /public – ACHTUNG: öffentlich abrufbar, kryptischen Namen wählen. */
    ticketPdf: string | null;
    navigationUrl: string | null;
    notes: LocalizedOrPlain | null;
  };
  restaurant: {
    name: string | null;
    address: string | null;
    reservationTime: string | null;
    reservationName: string | null;
    navigationUrl: string | null;
    notes: LocalizedOrPlain | null;
  };
  chapterTimes: Record<'morning' | 'mission' | 'tennis' | 'spa' | 'dinner', string | null>;
  epilogue: {
    /** Ab wann der Epilog erscheint (ISO mit Offset). 28.10. morgens Wiener Zeit (MEZ, +01:00). */
    availableFrom: string;
    locations: EpilogueLocation[];
  };
}

export const trip: TripConfig = {
  date: '2026-10-27',
  timeZone: 'Europe/Vienna',

  hotel: {
    name: 'Renaissance Vienna Schönbrunn Hotel',
    room: 'King Room',
    stay: { sr: '26–28. октобар 2026.', de: '26.–28. Oktober 2026' },
    address: null, // TODO: Adresse aus der Buchungsbestätigung
    mapsUrl: null,
    gymNotes: null,
    spaNotes: { sr: 'Сауна је укључена у ваш боравак.', de: 'Die Sauna ist in eurem Aufenthalt inklusive.' },
  },

  viennaWalk: {
    destination: { name: 'Schloss Schönbrunn', address: 'Schönbrunner Schloßstraße 47, 1130 Wien', navigationUrl: null },
    origin: 'Renaissance Vienna Schönbrunn Hotel',
    travelMode: 'walking',
  },

  viennaOpen: {
    eventName: 'Vienna Open',
    venue: null, // TODO: Arena bestätigen
    venueAddress: null,
    session: { sr: 'Цео дан, више мечева', de: 'Ganzer Tag, mehrere Matches' },
    entryTime: null,
    startTime: null,
    departureTime: null,
    seatInfo: null, // TODO
    ticketUrl: null, // TODO: Tickets sind vorhanden – Link eintragen
    ticketPdf: null,
    navigationUrl: null,
    notes: null,
  },

  restaurant: {
    name: null, // TODO: italienisch
    address: null,
    reservationTime: null,
    reservationName: null,
    navigationUrl: null,
    notes: null,
  },

  chapterTimes: {
    morning: null,
    mission: null,
    tennis: null,
    spa: null,
    dinner: null,
  },

  epilogue: {
    availableFrom: '2026-10-28T06:00:00+01:00',
    // TODO: 2–3 Orte mit wenig Laufen. Nichts erfinden – erst eintragen, wenn ausgewählt.
    locations: [],
  },
};
