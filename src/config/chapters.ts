/**
 * Struktur des Dienstags (fünf Kapitel) und der Familiengeschichte (Memory-Seiten, getrennt vom Tag).
 * Texte stehen in src/content/{sr,de}.ts, Persönliches in src/config/family.ts,
 * Reisedaten in src/config/trip.ts. Hier nur Ablauf & Verhalten.
 */

export const CHAPTER_IDS = ['morning', 'mission', 'tennis', 'spa', 'dinner'] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

export const INTERLUDE_IDS = ['gradskiKlub', 'wedding', 'family', 'work'] as const;
export type InterludeId = (typeof INTERLUDE_IDS)[number];

/**
 * Ablauf des Dienstags: nur die fünf Kapitel, keine biografischen Seiten dazwischen.
 * (Der Typ erlaubt Interludes, damit der Ablauf später ohne Umbau erweiterbar bleibt.)
 */
export type StoryStep = { kind: 'interlude'; id: InterludeId } | { kind: 'chapter'; id: ChapterId };

export const STORY: readonly StoryStep[] = [
  { kind: 'chapter', id: 'morning' },
  { kind: 'chapter', id: 'mission' },
  { kind: 'chapter', id: 'tennis' },
  { kind: 'chapter', id: 'spa' },
  { kind: 'chapter', id: 'dinner' },
];

/** Reihenfolge der Familiengeschichte („Ваша прича.“) – separat vom Tag, erscheint erst mit Fotos. */
export const FAMILY_STORY: readonly InterludeId[] = ['gradskiKlub', 'wedding', 'family', 'work'];

/** Stationen nach dem letzten Kapitel: Brief → kurzer, stiller Abschluss → „Ваш дан.“ */
export const FINALE_STAGES = ['letter', 'closing'] as const;
export type FinaleStage = (typeof FINALE_STAGES)[number];

export const QUESTION_IDS = [
  'morning.firstAwake',
  'morning.noWork',
  'tennis.mother.favorite',
  'tennis.father.food',
  'spa.lastDay',
  'dinner.still',
  'dinner.moment',
  'dinner.repeat',
  'epilogue.takeaway',
] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];

export type QuestionKind = { type: 'choice'; options: readonly string[] } | { type: 'text'; multiline: boolean };

/** Art der Frage. Die Optionen sind stabile Schlüssel; die Beschriftung kommt aus den Texten. */
export const QUESTIONS: Record<QuestionId, QuestionKind> = {
  'morning.firstAwake': { type: 'choice', options: ['mother', 'father'] },
  'morning.noWork': { type: 'choice', options: ['10', '30', 'try'] },
  'tennis.mother.favorite': { type: 'text', multiline: false },
  'tennis.father.food': { type: 'choice', options: ['30', 'set', 'asked'] },
  'spa.lastDay': { type: 'text', multiline: true },
  'dinner.still': { type: 'text', multiline: true },
  'dinner.moment': { type: 'text', multiline: true },
  'dinner.repeat': { type: 'text', multiline: true },
  'epilogue.takeaway': { type: 'text', multiline: true },
};

export type InfoCardKind = 'ticket' | 'restaurant' | 'hotel-gym' | 'hotel-spa' | 'route';
export type MusicSlot = 'morning' | 'spa' | 'finale';

export interface ChapterDefinition {
  id: ChapterId;
  /** Wird ein Foto erwartet? (Es gibt immer einen dezenten Ausweg.) */
  photoRequired: boolean;
  /** Gibt es überhaupt eine Foto-Station? */
  photo: boolean;
  /** Kamera-Hinweis für Mobilgeräte: Selfie = Frontkamera. */
  capture: 'user' | 'environment';
  info: InfoCardKind | null;
  questions: readonly QuestionId[];
  taskStyle: 'steps' | 'ritual' | 'plain';
  music: MusicSlot | null;
}

export const CHAPTERS: readonly ChapterDefinition[] = [
  {
    id: 'morning',
    photoRequired: true,
    photo: true,
    capture: 'user',
    info: null,
    questions: ['morning.firstAwake', 'morning.noWork'],
    taskStyle: 'plain',
    music: 'morning',
  },
  {
    id: 'mission',
    photoRequired: true,
    photo: true,
    capture: 'user',
    info: 'hotel-gym',
    questions: [],
    taskStyle: 'steps',
    music: null,
  },
  {
    id: 'tennis',
    photoRequired: true,
    photo: true,
    capture: 'user',
    info: 'ticket',
    questions: ['tennis.mother.favorite', 'tennis.father.food'],
    taskStyle: 'plain',
    music: null,
  },
  {
    id: 'spa',
    photoRequired: true,
    photo: true,
    capture: 'user',
    info: 'hotel-spa',
    questions: ['spa.lastDay'],
    taskStyle: 'ritual',
    music: 'spa',
  },
  {
    id: 'dinner',
    photoRequired: true,
    photo: true,
    capture: 'environment',
    info: 'restaurant',
    questions: ['dinner.still', 'dinner.moment', 'dinner.repeat'],
    taskStyle: 'plain',
    music: null,
  },
];

export const TOTAL_CHAPTERS = CHAPTERS.length;

export function chapterIndex(id: ChapterId): number {
  return CHAPTER_IDS.indexOf(id);
}

export function getChapter(id: ChapterId): ChapterDefinition {
  const chapter = CHAPTERS.find((c) => c.id === id);
  if (!chapter) throw new Error(`Unknown chapter ${id}`);
  return chapter;
}

export function isChapterId(value: unknown): value is ChapterId {
  return typeof value === 'string' && (CHAPTER_IDS as readonly string[]).includes(value);
}

export function isQuestionId(value: unknown): value is QuestionId {
  return typeof value === 'string' && (QUESTION_IDS as readonly string[]).includes(value);
}

/** Schlüssel, unter dem ein gesehenes Interlude / eine Finale-Station im Fortschritt vermerkt wird. */
export const seenKey = {
  interlude: (id: InterludeId) => `interlude:${id}`,
  finale: (stage: FinaleStage) => `finale:${stage}`,
  epilogue: 'epilogue:done',
} as const;
