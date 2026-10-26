import { describe, expect, it } from 'vitest';
import { seenKey, STORY } from '../config/chapters';
import {
  advancePhase,
  completeChapter,
  currentChapterId,
  currentChapterIndex,
  currentStep,
  currentStepIndex,
  initialProgress,
  isComplete,
  markSeen,
  mergeProgress,
  mergeResponses,
  normalizeProgress,
  progressAtStep,
  stepIndexOfChapter,
} from './progress';

const T0 = '2026-10-27T07:00:00.000Z';
const T1 = '2026-10-27T08:00:00.000Z';

describe('progress', () => {
  it('starts at the opening with breakfast as the first step of Tuesday', () => {
    const p = initialProgress(T0);
    expect(p.phase).toBe('opening');
    expect(currentChapterIndex(p)).toBe(0);
    expect(currentChapterId(p)).toBe('morning');
    expect(currentStep(p)).toEqual({ kind: 'chapter', id: 'morning' });
  });

  it('keeps Tuesday free of biographical interludes: five chapters in a row', () => {
    expect(STORY.map((s) => `${s.kind}:${s.id}`)).toEqual([
      'chapter:morning',
      'chapter:mission',
      'chapter:tennis',
      'chapter:spa',
      'chapter:dinner',
    ]);
  });

  it('advances phases only forward', () => {
    const intro = advancePhase(initialProgress(T0), 'intro', T1);
    expect(intro.phase).toBe('intro');
    expect(intro.startedAt).toBe(T1);
    expect(advancePhase(intro, 'opening')).toBe(intro);
  });

  it('walks chapter by chapter', () => {
    let p = advancePhase(initialProgress(T0), 'journey', T0);
    p = completeChapter(p, 'morning', T1);
    expect(currentStep(p)).toEqual({ kind: 'chapter', id: 'mission' });
    p = markSeen(p, seenKey.interlude('wedding'), T1);
    expect(currentStep(p)).toEqual({ kind: 'chapter', id: 'mission' });
  });

  it('completes chapters in canonical order and reaches the finale', () => {
    let p = advancePhase(initialProgress(T0), 'journey', T0);
    for (const id of ['mission', 'morning', 'tennis', 'spa', 'dinner'] as const) p = completeChapter(p, id, T1);
    expect(p.completed).toEqual(['morning', 'mission', 'tennis', 'spa', 'dinner']);
    expect(isComplete(p)).toBe(true);
    expect(p.phase).toBe('finale');
    expect(p.finishedAt).toBe(T1);
    expect(currentChapterId(p)).toBeNull();
  });

  it('builds debug progress for any step', () => {
    const atTennis = progressAtStep(stepIndexOfChapter('tennis'), T0);
    expect(currentStep(atTennis)).toEqual({ kind: 'chapter', id: 'tennis' });
    expect(atTennis.completed).toEqual(['morning', 'mission']);
    const end = progressAtStep(STORY.length, T0, [seenKey.finale('letter')]);
    expect(end.phase).toBe('finale');
    expect(end.seen).toContain('finale:letter');
    expect(currentStepIndex(end)).toBe(STORY.length);
  });

  it('merges two devices monotonically, including seen memories', () => {
    const a = markSeen({ ...progressAtStep(1, T0), updatedAt: T0 }, 'finale:letter', T0);
    const b = markSeen({ ...advancePhase(initialProgress(T0), 'intro', T1), completed: ['tennis' as const] }, 'epilogue:done', T1);
    const merged = mergeProgress(a, b);
    expect(merged.completed).toEqual(['morning', 'tennis']);
    expect(merged.seen).toEqual(['epilogue:done', 'finale:letter']);
    expect(merged.phase).toBe('journey');
    expect(merged.startedAt).toBe(T0);
    expect(merged.updatedAt).toBe(T1);
  });

  it('ignores malformed seen keys', () => {
    expect(markSeen(initialProgress(T0), 'nope nope').seen).toEqual([]);
    expect(normalizeProgress({ phase: 'journey', seen: ['ok:key', 'bad key', 5] })?.seen).toEqual(['ok:key']);
  });

  it('rejects malformed persisted data and drops unknown chapters (e.g. old "pause"/"vienna")', () => {
    expect(normalizeProgress(null)).toBeNull();
    expect(normalizeProgress({ phase: 'nope' })).toBeNull();
    const p = normalizeProgress({ phase: 'journey', completed: ['dinner', 'pause', 'vienna', 'morning'], startedAt: 'bad' });
    expect(p?.completed).toEqual(['morning', 'dinner']);
    expect(p?.startedAt).toBeNull();
    expect(p?.seen).toEqual([]);
  });

  it('keeps the newer answer per question', () => {
    const merged = mergeResponses(
      { 'dinner.moment': { value: 'alt', updatedAt: T0 } },
      { 'dinner.moment': { value: 'neu', updatedAt: T1 }, 'spa.lastDay': { value: 'X', updatedAt: T0 } },
    );
    expect(merged['dinner.moment']?.value).toBe('neu');
    expect(merged['spa.lastDay']?.value).toBe('X');
  });
});
