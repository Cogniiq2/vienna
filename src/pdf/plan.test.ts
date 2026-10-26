import { describe, expect, it } from 'vitest';
import type { ChapterId } from '../config/chapters';
import { planMemoryPages, type MemoryAssetSlot } from './plan';

const ALL: ChapterId[] = ['morning', 'mission', 'tennis', 'spa', 'dinner'];

describe('memory album plan', () => {
  it('keeps the day together and puts the family album after it', () => {
    const pages = planMemoryPages({
      photos: new Set(ALL),
      assets: new Set<MemoryAssetSlot>(['gradskiKlub', 'wedding', 'familyEarly', 'familyCurrent']),
      answers: { 'dinner.moment': 'Шетња', 'dinner.still': 'Смех', 'spa.lastDay': 'Не сећамо се', 'epilogue.takeaway': 'Мир' },
      completed: ALL,
    });
    expect(pages.map((p) => (p.kind === 'chapter' ? p.id : p.kind === 'memory' ? `memory:${p.slot}` : p.kind))).toEqual([
      'cover',
      'letter',
      'morning',
      'mission',
      'tennis',
      'spa',
      'dinner',
      'answers',
      'answers',
      'memory:gradskiKlub',
      'memory:wedding',
      'memory:familyEarly',
      'story',
      'family',
      'closing',
    ]);
    expect(pages[0]).toEqual({ kind: 'cover', photo: 'dinner' });
  });

  it('still produces a complete album when every family photo and day photo is missing', () => {
    const pages = planMemoryPages({ photos: new Set(), assets: new Set(), answers: {}, completed: ['morning'] });
    expect(pages.map((p) => p.kind)).toEqual(['cover', 'letter', 'chapter', 'closing']);
    expect(pages[0]).toEqual({ kind: 'cover', photo: null });
  });

  it('ignores empty answers', () => {
    const pages = planMemoryPages({ photos: new Set(), assets: new Set(), answers: { 'dinner.moment': '   ' }, completed: [] });
    expect(pages.some((p) => p.kind === 'answers')).toBe(false);
  });
});

describe('first real version: only the current family photo', () => {
  it('adds just the family page before the closing', () => {
    const pages = planMemoryPages({ photos: new Set(['dinner']), assets: new Set(['familyCurrent']), answers: {}, completed: ALL });
    expect(pages.slice(-2).map((p) => p.kind)).toEqual(['family', 'closing']);
    expect(pages.some((p) => p.kind === 'memory' || p.kind === 'story')).toBe(false);
  });
});
