import type { ChapterId, InterludeId, QuestionId } from '../config/chapters';
import type { AssetSlot } from '../config/family';

export type Language = 'sr' | 'de';
export const LANGUAGES: readonly Language[] = ['sr', 'de'];
export const DEFAULT_LANGUAGE: Language = 'sr';

/** Familien-Leitmotiv. Wird bewusst nie übersetzt und nie erklärt. */
export const MOTIF = 'Јел’ знате?';

export interface TaskItem {
  title: string;
  detail?: string;
}

/** Bildquelle eines Story-Frames: ein Familien-Asset oder ein heutiges Foto der Eltern. */
export type FrameAsset = Exclude<AssetSlot, 'familyVideo' | 'videoPoster' | 'audioDjordje' | 'audioBogdana' | 'audioLazar'> | 'parentsToday';

/** Eine „Seite“ einer Erinnerungssequenz. */
export interface StoryFrame {
  lines: string[];
  small?: string;
  asset?: FrameAsset;
  size?: 'xl' | 'lg' | 'md';
  /** Unterschrift der Kinder statt Text. */
  signature?: boolean;
}

export interface ChapterContent {
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** Großer Reveal-Schriftzug (Tennis). */
  reveal?: string;
  /** Kurze Zeilen der Geschichte (eigener Screen). */
  story: string[];
  storyClose?: string;
  /** Die Regel beim Dinner. */
  rule?: { intro: string; items: string[]; punchline: string };
  toast?: string;
  tasksTitle?: string;
  tasks: TaskItem[];
  note?: string;
  challenge?: string;
  photo?: { title: string; text: string };
  saved: string;
  completeCta?: string;
  pdf: { title: string; text: string };
}

export interface QuestionContent {
  title: string;
  hint?: string;
  placeholder?: string;
  options?: Record<string, string>;
  /** Kurzer Titel fürs Album/PDF. */
  pdfLabel: string;
}

export interface Dictionary {
  meta: { htmlLang: string; documentTitle: string };
  common: {
    dateShort: string;
    dateLong: string;
    languageLabel: string;
    switchTo: string;
    footer: string;
    tbd: string;
    optional: string;
    next: string;
    reload: string;
    offline: string;
    syncing: string;
    and: string;
  };
  opening: { place: string; dedication: string; tagline: string; cta: string; continue: string };
  intro: {
    before: string[];
    turn: string;
    after: string[];
    highlightLead: string;
    highlight: string[];
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
    toast: string;
    locked: string;
    lockedHint: string;
    unlocked: string;
    reviewBack: string;
    reviewing: string;
    timeLabel: (time: string) => string;
  };
  interludes: Record<InterludeId, StoryFrame[]>;
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
    showWay: string;
    notes: string;
    restaurant: string;
    address: string;
    reservation: string;
    reservationName: string;
    hotel: string;
    room: string;
    stay: string;
    openMaps: string;
    ticketTitle: string;
    restaurantTitle: string;
    hotelTitle: string;
    routeTitle: string;
    routeHint: string;
  };
  questions: Record<QuestionId, QuestionContent> & {
    ui: { save: string; edit: string; saved: string; write: string };
  };
  music: { title: string; hint: string; spotify: string; apple: string; youtube: string };
  chapters: Record<ChapterId, ChapterContent>;
  messages: { eyebrow: string; dismiss: string };
  /** Ende des Dienstags: Brief, dann ein kurzer, stiller Abschluss. */
  finale: {
    title: string;
    letter: { salutation: string; opening: string[]; emphasis: string; list: string[]; after: string[]; closing: string };
    closing: StoryFrame[];
    signature: string;
    home: {
      title: string;
      text: string;
      empty: string;
      replay: string;
      memoryTitle: string;
      memoryText: string;
      memoryCta: string;
      storyEyebrow: string;
      storyTitle: string;
      storyText: string;
      epilogueEyebrow: string;
      epilogueTitle: string;
    };
  };
  /** Familiengeschichte („Ваша прича.“) – getrennt vom Dienstag, erscheint erst, wenn Fotos/Medien da sind. */
  familyStory: {
    eyebrow: string;
    video: { title: string; play: string; transcript: string };
    voices: { title: string; play: string; pause: string; transcript: string; progress: string };
    ending: StoryFrame[];
    back: string;
  };
  epilogue: {
    eyebrow: string;
    title: string;
    lines: string[];
    facts: Array<{ title: string; text: string }>;
    walk: TaskItem;
    locationsTitle: string;
    update: string;
    updateHint: string;
    farewell: string;
    back: string;
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
    coverSubline: string;
    letterEyebrow: string;
    memoryEyebrow: string;
    chapterEyebrow: (roman: string) => string;
    capturedAt: (time: string) => string;
    answersEyebrow: string;
    answersTitle: string;
    closingSmall: string;
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
    mediaFailed: string;
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
