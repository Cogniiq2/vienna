import type { ChapterId } from '../config/chapters';

export type Language = 'sr' | 'de';
export const LANGUAGES: readonly Language[] = ['sr', 'de'];
export const DEFAULT_LANGUAGE: Language = 'sr';

export interface TaskItem {
  title: string;
  detail?: string;
}

export interface ChapterContent {
  /** Kleiner Text über der Headline. */
  eyebrow: string;
  title: string;
  /** Erster, etwas größerer Satz. */
  lead: string;
  body: string[];
  tasks: TaskItem[];
  /** Ruhiger Hinweis (z. B. „nur soweit ihr euch wohlfühlt“). */
  note?: string;
  /** Optionale Zusatz-Challenge. */
  challenge?: string;
  photo: { title: string; text: string };
  /** Text nach dem Speichern. */
  saved: string;
  /** CTA, wenn kein Foto nötig ist. */
  completeCta?: string;
  /** Großer Reveal-Schriftzug (nur Tennis). */
  reveal?: string;
  pdf: { title: string; text: string };
}

export interface Dictionary {
  meta: {
    htmlLang: string;
    documentTitle: string;
  };
  common: {
    dateShort: string;
    dateLong: string;
    city: string;
    languageLabel: string;
    switchTo: string;
    footer: string;
    tbd: string;
    optional: string;
    reload: string;
    offline: string;
    syncing: string;
  };
  opening: {
    dedication: string;
    place: string;
    tagline: string;
    cta: string;
  };
  intro: {
    greeting: string;
    lines: string[];
    highlightLead: string;
    highlight: string;
    closing: string[];
    cta: string;
  };
  chapter: {
    label: (roman: string) => string;
    progress: (current: number, total: number) => string;
    progressAria: string;
    statusDone: string;
    statusCurrent: string;
    statusLocked: string;
    task: string;
    tasks: string;
    challenge: string;
    question: string;
    locked: string;
    lockedHint: string;
    unlocked: string;
    reviewBack: string;
    reviewing: string;
    timeLabel: (time: string) => string;
  };
  photo: {
    heading: string;
    capture: string;
    gallery: string;
    use: string;
    retake: string;
    replace: string;
    preparing: string;
    saving: string;
    synced: string;
    pending: string;
    localOnly: string;
    skip: string;
    privacy: string;
    previewAlt: (chapterTitle: string) => string;
    savedAlt: (chapterTitle: string) => string;
    loading: string;
  };
  info: {
    event: string;
    venue: string;
    session: string;
    entry: string;
    start: string;
    departure: string;
    seats: string;
    openTicket: string;
    openTicketPdf: string;
    navigate: string;
    notes: string;
    restaurant: string;
    address: string;
    reservation: string;
    reservationName: string;
    hotel: string;
    openMaps: string;
    ticketTitle: string;
    restaurantTitle: string;
    hotelTitle: string;
  };
  questions: {
    winnerTitle: string;
    winnerHint: string;
    winnerPlaceholder: string;
    momentTitle: string;
    momentHint: string;
    momentPlaceholder: string;
    saved: string;
  };
  chapters: Record<ChapterId, ChapterContent>;
  final: {
    lines: string[];
    signature: string;
    cta: string;
  };
  memory: {
    steps: string[];
    ready: string;
    readyText: string;
    download: string;
    share: string;
    regenerate: string;
    fileName: string;
    shareTitle: string;
    missingPhotos: string;
    error: string;
    retry: string;
  };
  pdf: {
    coverTitle: string;
    coverDate: string;
    coverDedication: string;
    coverSubline: string;
    letterEyebrow: string;
    letterSalutation: string;
    letter: string[];
    letterSignoff: string;
    chapterEyebrow: (roman: string) => string;
    capturedAt: (time: string) => string;
    predictionTitle: string;
    momentTitle: string;
    closing: string[];
    closingSignature: string;
    colophon: string;
    documentTitle: string;
  };
  errors: {
    cameraUnavailable: string;
    invalidFile: string;
    fileTooLarge: string;
    processingFailed: string;
    uploadFailed: string;
    backendUnreachable: string;
    storageFull: string;
    generic: string;
    genericTitle: string;
  };
  gate: {
    privateTitle: string;
    privateText: string;
    invalidTitle: string;
    invalidText: string;
    loading: string;
  };
}
