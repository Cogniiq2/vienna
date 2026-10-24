/**
 * Struktur der sechs Kapitel. Texte stehen in src/content/{sr,de}.ts,
 * Reisedaten in src/config/trip.ts. Hier nur Ablauf & Verhalten.
 */

export const CHAPTER_IDS = ['morning', 'mission', 'tennis', 'pause', 'spa', 'dinner'] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

export const QUESTION_IDS = ['tennis.winner.mother', 'tennis.winner.father', 'dinner.moment'] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];

export type InfoCardKind = 'ticket' | 'restaurant' | 'hotel' | 'hotel-gym' | 'hotel-spa';

export interface ChapterDefinition {
  id: ChapterId;
  /** Muss ein Foto gemacht werden, damit das Kapitel abgeschlossen wird? */
  photoRequired: boolean;
  /** Kamera-Hinweis für Mobilgeräte: Selfie = Frontkamera. */
  capture: 'user' | 'environment';
  /** Praktische Info-Karte (Tickets, Restaurant …). */
  info: InfoCardKind | null;
  /** Fragen, deren Antworten im PDF landen. */
  questions: readonly QuestionId[];
  /** Darstellung der Aufgabenliste: nummerierte Schritte oder ruhige Liste. */
  taskStyle: 'steps' | 'ritual' | 'plain';
}

export const CHAPTERS: readonly ChapterDefinition[] = [
  { id: 'morning', photoRequired: true, capture: 'user', info: null, questions: [], taskStyle: 'plain' },
  { id: 'mission', photoRequired: true, capture: 'user', info: 'hotel-gym', questions: [], taskStyle: 'steps' },
  {
    id: 'tennis',
    photoRequired: true,
    capture: 'user',
    info: 'ticket',
    questions: ['tennis.winner.mother', 'tennis.winner.father'],
    taskStyle: 'plain',
  },
  { id: 'pause', photoRequired: false, capture: 'environment', info: 'hotel', questions: [], taskStyle: 'plain' },
  { id: 'spa', photoRequired: true, capture: 'user', info: 'hotel-spa', questions: [], taskStyle: 'ritual' },
  {
    id: 'dinner',
    photoRequired: true,
    capture: 'environment',
    info: 'restaurant',
    questions: ['dinner.moment'],
    taskStyle: 'plain',
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
