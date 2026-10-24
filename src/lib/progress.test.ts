import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  completeChapter,
  currentChapterId,
  currentChapterIndex,
  initialProgress,
  isComplete,
  mergeProgress,
  mergeResponses,
  normalizeProgress,
  progressAtChapter,
} from './progress';

const T0 = '2026-10-27T07:00:00.000Z';
const T1 = '2026-10-27T08:00:00.000Z';

describe('progress', () => {
  it('starts at the opening with chapter 1 as current', () => {
    const p = initialProgress(T0);
    expect(p.phase).toBe('opening');
    expect(currentChapterIndex(p)).toBe(0);
    expect(currentChapterId(p)).toBe('morning');
  });

  it('advances phases only forward', () => {
    const intro = advancePhase(initialProgress(T0), 'intro', T1);
    expect(intro.phase).toBe('intro');
    expect(intro.startedAt).toBe(T1);
    expect(advancePhase(intro, 'opening')).toBe(intro);
  });

  it('completes chapters in canonical order and reaches the finale', () => {
    let p = advancePhase(initialProgress(T0), 'journey', T0);
    p = completeChapter(p, 'mission', T1);
    p = completeChapter(p, 'morning', T1);
    expect(p.completed).toEqual(['morning', 'mission']);
    expect(currentChapterId(p)).toBe('tennis');
    for (const id of ['tennis', 'pause', 'spa', 'dinner'] as const) p = completeChapter(p, id, T1);
    expect(isComplete(p)).toBe(true);
    expect(p.phase).toBe('finale');
    expect(p.finishedAt).toBe(T1);
    expect(currentChapterId(p)).toBeNull();
  });

  it('is idempotent when completing twice', () => {
    const p = completeChapter(progressAtChapter(1, T0), 'morning', T1);
    expect(p.completed).toEqual(['morning']);
  });

  it('merges two devices monotonically', () => {
    const a = { ...progressAtChapter(2, T0), updatedAt: T0 };
    const b = { ...advancePhase(initialProgress(T0), 'intro', T1), completed: ['pause' as const] };
    const merged = mergeProgress(a, b);
    expect(merged.completed).toEqual(['morning', 'mission', 'pause']);
    expect(merged.phase).toBe('journey');
    expect(merged.startedAt).toBe(T0);
    expect(merged.updatedAt).toBe(T1);
  });

  it('forces the finale when every chapter is done', () => {
    const merged = mergeProgress(progressAtChapter(3, T0), { ...progressAtChapter(6, T1), phase: 'journey' });
    expect(merged.phase).toBe('finale');
  });

  it('rejects malformed persisted data', () => {
    expect(normalizeProgress(null)).toBeNull();
    expect(normalizeProgress({ phase: 'nope' })).toBeNull();
    const p = normalizeProgress({ phase: 'journey', completed: ['dinner', 'x', 'morning'], startedAt: 'bad' });
    expect(p?.completed).toEqual(['morning', 'dinner']);
    expect(p?.startedAt).toBeNull();
  });

  it('keeps the newer answer per question', () => {
    const merged = mergeResponses(
      { 'dinner.moment': { value: 'alt', updatedAt: T0 } },
      { 'dinner.moment': { value: 'neu', updatedAt: T1 }, 'tennis.winner.mother': { value: 'X', updatedAt: T0 } },
    );
    expect(merged['dinner.moment']?.value).toBe('neu');
    expect(merged['tennis.winner.mother']?.value).toBe('X');
  });
});
