import { CHAPTER_IDS, isChapterId, isQuestionId, seenKey, STORY, type ChapterId, type QuestionId, type StoryStep } from '../config/chapters';

export const PHASES = ['opening', 'intro', 'journey', 'finale'] as const;
export type Phase = (typeof PHASES)[number];

export interface TripProgress {
  phase: Phase;
  /** Abgeschlossene Kapitel, immer in kanonischer Reihenfolge. */
  completed: ChapterId[];
  /** Gesehene Erinnerungsseiten / Finale-Stationen (z. B. "interlude:wedding"). Nur wachsend. */
  seen: string[];
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

export interface ResponseEntry {
  value: string;
  updatedAt: string;
}
export type Responses = Partial<Record<QuestionId, ResponseEntry>>;

export function initialProgress(now = new Date().toISOString()): TripProgress {
  return { phase: 'opening', completed: [], seen: [], startedAt: null, finishedAt: null, updatedAt: now };
}

export function phaseRank(phase: Phase): number {
  return PHASES.indexOf(phase);
}

function isPhase(value: unknown): value is Phase {
  return typeof value === 'string' && (PHASES as readonly string[]).includes(value);
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

const SEEN_PATTERN = /^[a-z]+:[A-Za-z]+$/;

function sortSeen(keys: Iterable<string>): string[] {
  return [...new Set(keys)].filter((k) => SEEN_PATTERN.test(k)).sort();
}

function sortChapters(ids: Iterable<ChapterId>): ChapterId[] {
  const set = new Set(ids);
  return CHAPTER_IDS.filter((id) => set.has(id));
}

/** Index des aktuellen Kapitels (= erstes nicht abgeschlossenes). Gleich CHAPTER_IDS.length, wenn alles erledigt ist. */
export function currentChapterIndex(progress: TripProgress): number {
  const idx = CHAPTER_IDS.findIndex((id) => !progress.completed.includes(id));
  return idx === -1 ? CHAPTER_IDS.length : idx;
}

export function currentChapterId(progress: TripProgress): ChapterId | null {
  return CHAPTER_IDS[currentChapterIndex(progress)] ?? null;
}

export function isComplete(progress: TripProgress): boolean {
  return CHAPTER_IDS.every((id) => progress.completed.includes(id));
}

/** Liest beliebige (untrusted) Daten aus localStorage/Backend defensiv ein. */
export function normalizeProgress(raw: unknown): TripProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const phase = isPhase(r.phase) ? r.phase : null;
  if (!phase) return null;
  const completedRaw = Array.isArray(r.completed) ? r.completed : [];
  return {
    phase,
    completed: sortChapters(completedRaw.filter(isChapterId)),
    seen: sortSeen((Array.isArray(r.seen) ? r.seen : []).filter((k): k is string => typeof k === 'string')),
    startedAt: isIso(r.startedAt) ? r.startedAt : null,
    finishedAt: isIso(r.finishedAt) ? r.finishedAt : null,
    updatedAt: isIso(r.updatedAt) ? r.updatedAt : new Date(0).toISOString(),
  };
}

function earliest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

function latest(a: string, b: string): string {
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/**
 * Fortschritt ist monoton: Kapitel werden nur hinzugefügt, Phasen gehen nur vorwärts.
 * Dadurch können zwei Geräte (Mama & Papa) gefahrlos parallel arbeiten.
 */
export function mergeProgress(a: TripProgress, b: TripProgress): TripProgress {
  const completed = sortChapters([...a.completed, ...b.completed]);
  const phase = phaseRank(a.phase) >= phaseRank(b.phase) ? a.phase : b.phase;
  return {
    phase: completed.length === CHAPTER_IDS.length ? 'finale' : phase,
    completed,
    seen: sortSeen([...a.seen, ...b.seen]),
    startedAt: earliest(a.startedAt, b.startedAt),
    finishedAt: earliest(a.finishedAt, b.finishedAt),
    updatedAt: latest(a.updatedAt, b.updatedAt),
  };
}

export function progressEquals(a: TripProgress, b: TripProgress): boolean {
  return (
    a.phase === b.phase &&
    a.completed.join() === b.completed.join() &&
    a.seen.join() === b.seen.join() &&
    a.startedAt === b.startedAt &&
    a.finishedAt === b.finishedAt
  );
}

export function advancePhase(progress: TripProgress, phase: Phase, now = new Date().toISOString()): TripProgress {
  if (phaseRank(phase) <= phaseRank(progress.phase)) return progress;
  return {
    ...progress,
    phase,
    startedAt: progress.startedAt ?? (phase === 'intro' || phase === 'journey' ? now : null),
    updatedAt: now,
  };
}

export function completeChapter(progress: TripProgress, id: ChapterId, now = new Date().toISOString()): TripProgress {
  if (progress.completed.includes(id)) return progress;
  const completed = sortChapters([...progress.completed, id]);
  const done = completed.length === CHAPTER_IDS.length;
  return {
    ...progress,
    phase: done ? 'finale' : phaseRank(progress.phase) < phaseRank('journey') ? 'journey' : progress.phase,
    completed,
    startedAt: progress.startedAt ?? now,
    finishedAt: done ? (progress.finishedAt ?? now) : progress.finishedAt,
    updatedAt: now,
  };
}

export function markSeen(progress: TripProgress, key: string, now = new Date().toISOString()): TripProgress {
  if (progress.seen.includes(key) || !SEEN_PATTERN.test(key)) return progress;
  return { ...progress, seen: sortSeen([...progress.seen, key]), updatedAt: now };
}

/** Ein Interlude gilt auch als erledigt, wenn schon ein späteres Kapitel abgeschlossen ist (z. B. am anderen Handy). */
export function isStepDone(progress: TripProgress, step: StoryStep): boolean {
  if (step.kind === 'chapter') return progress.completed.includes(step.id);
  if (progress.seen.includes(seenKey.interlude(step.id))) return true;
  const at = STORY.findIndex((s) => s.kind === 'interlude' && s.id === step.id);
  return STORY.slice(at + 1).some((s) => s.kind === 'chapter' && progress.completed.includes(s.id));
}

/** Index des aktuellen Schritts im Tagesablauf (Interludes + Kapitel). STORY.length = alles erledigt. */
export function currentStepIndex(progress: TripProgress): number {
  const idx = STORY.findIndex((step) => !isStepDone(progress, step));
  return idx === -1 ? STORY.length : idx;
}

export function currentStep(progress: TripProgress): StoryStep | null {
  return STORY[currentStepIndex(progress)] ?? null;
}

/**
 * Debug/Tests: Fortschritt so setzen, dass STORY[stepIndex] der aktuelle Schritt ist.
 * stepIndex >= STORY.length → Finale.
 */
export function progressAtStep(stepIndex: number, now = new Date().toISOString(), extraSeen: string[] = []): TripProgress {
  const clamped = Math.max(0, Math.min(stepIndex, STORY.length));
  const done = STORY.slice(0, clamped);
  const completed = done.flatMap((s) => (s.kind === 'chapter' ? [s.id] : []));
  const seen = done.flatMap((s) => (s.kind === 'interlude' ? [seenKey.interlude(s.id)] : []));
  const finished = clamped === STORY.length;
  return {
    phase: finished ? 'finale' : 'journey',
    completed: sortChapters(completed),
    seen: sortSeen([...seen, ...extraSeen]),
    startedAt: now,
    finishedAt: finished ? now : null,
    updatedAt: now,
  };
}

/** Index des Schritts, an dem ein Kapitel steht. */
export function stepIndexOfChapter(id: ChapterId): number {
  return STORY.findIndex((s) => s.kind === 'chapter' && s.id === id);
}

export function normalizeResponses(raw: unknown): Responses {
  const out: Responses = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!isQuestionId(key) || !entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.value !== 'string') continue;
    out[key] = { value: e.value.slice(0, 2000), updatedAt: isIso(e.updatedAt) ? e.updatedAt : new Date(0).toISOString() };
  }
  return out;
}

/** Pro Frage gewinnt die neuere Antwort. */
export function mergeResponses(a: Responses, b: Responses): Responses {
  const out: Responses = { ...a };
  for (const [key, entry] of Object.entries(b) as [QuestionId, ResponseEntry][]) {
    const existing = out[key];
    if (!existing || Date.parse(entry.updatedAt) > Date.parse(existing.updatedAt)) out[key] = entry;
  }
  return out;
}
