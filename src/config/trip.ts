/**
 * Zentrale Trip-Konfiguration.
 *
 * Hier stehen ALLE echten Reisedaten. Nichts davon ist in UI-Komponenten hartcodiert.
 *
 * Regeln:
 * - `null` bedeutet „noch nicht bekannt“. Die UI zeigt dann dezent „Биће допуњено“ / „Wird noch ergänzt“
 *   bzw. blendet die Zeile aus. Nichts wird erfunden.
 * - Texte, die übersetzt werden müssen, sind `Localized` ({ sr, de }).
 *   Eigennamen und Adressen sind einfache Strings.
 * - Uhrzeiten im Format "HH:MM" (Wiener Ortszeit).
 * - Links: vollständige https-URLs, z. B. Google-Maps-Link
 *   (https://www.google.com/maps/search/?api=1&query=<Adresse>) oder Apple-Maps-Link.
 */

export type Localized = { sr: string; de: string };
export type LocalizedOrPlain = string | Localized;

export interface TripConfig {
  /** ISO-Datum des Tages (Wiener Zeit). */
  date: string;
  timeZone: string;
  family: {
    mother: Localized;
    father: Localized;
    /** Optional: Namen der Kinder für die Signatur, z. B. [{ sr: 'Лазар', de: 'Lazar' }]. Leer = nur „Ваша деца“. */
    children: Localized[];
  };
  hotel: {
    name: string | null;
    address: string | null;
    mapsUrl: string | null;
    /** z. B. Hinweis zum Gym oder Spa (Öffnungszeiten, Stockwerk). */
    gymNotes: LocalizedOrPlain | null;
    spaNotes: LocalizedOrPlain | null;
  };
  viennaOpen: {
    /** Anzeigename des Events. */
    eventName: string;
    /** TODO bestätigen – z. B. „Wiener Stadthalle“. */
    venue: string | null;
    venueAddress: string | null;
    /** z. B. { sr: 'Дневна сесија', de: 'Tagessession' } oder ein bestätigtes Match. Spieler erst eintragen, wenn bestätigt. */
    session: LocalizedOrPlain | null;
    /** Einlass, "HH:MM". */
    entryTime: string | null;
    /** Beginn, "HH:MM". */
    startTime: string | null;
    /** Empfohlene Abfahrt vom Hotel, "HH:MM". */
    departureTime: string | null;
    seatInfo: LocalizedOrPlain | null;
    /** Link zu Online-Tickets / Wallet. */
    ticketUrl: string | null;
    /**
     * Optional: Pfad zu einem Ticket-PDF unter /public (z. B. "/t/8f3k2-tickets.pdf").
     * ACHTUNG: Dateien in /public sind öffentlich abrufbar – kryptischen Dateinamen wählen.
     */
    ticketPdf: string | null;
    navigationUrl: string | null;
    notes: LocalizedOrPlain | null;
  };
  restaurant: {
    name: string | null;
    address: string | null;
    /** "HH:MM" */
    reservationTime: string | null;
    reservationName: string | null;
    navigationUrl: string | null;
    notes: LocalizedOrPlain | null;
  };
  /** Optionale Uhrzeiten pro Kapitel ("HH:MM"), werden dezent im Kapitelkopf gezeigt. */
  chapterTimes: {
    morning: string | null;
    mission: string | null;
    tennis: string | null;
    pause: string | null;
    spa: string | null;
    dinner: string | null;
  };
}

export const trip: TripConfig = {
  date: '2026-10-27',
  timeZone: 'Europe/Vienna',

  family: {
    mother: { sr: 'Мама', de: 'Mama' },
    father: { sr: 'Тата', de: 'Papa' },
    children: [],
  },

  hotel: {
    name: null, // TODO: Hotelname
    address: null, // TODO: Hoteladresse
    mapsUrl: null, // TODO: Maps-Link
    gymNotes: null,
    spaNotes: null,
  },

  viennaOpen: {
    eventName: 'Vienna Open',
    venue: null, // TODO: Arena bestätigen
    venueAddress: null,
    session: null, // TODO: Session / Match – nur bestätigte Infos
    entryTime: null,
    startTime: null,
    departureTime: null,
    seatInfo: null, // TODO: z. B. { sr: 'Сектор B · ред 7 · места 12 и 13', de: 'Sektor B · Reihe 7 · Plätze 12 und 13' }
    ticketUrl: null,
    ticketPdf: null,
    navigationUrl: null,
    notes: null,
  },

  restaurant: {
    name: null, // TODO
    address: null, // TODO
    reservationTime: null, // TODO "19:30"
    reservationName: null, // TODO
    navigationUrl: null,
    notes: null,
  },

  chapterTimes: {
    morning: null,
    mission: null,
    tennis: null,
    pause: null,
    spa: null,
    dinner: null,
  },
};
