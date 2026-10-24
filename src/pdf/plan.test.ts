import { describe, expect, it } from 'vitest';
import type { ChapterId } from '../config/chapters';
import { planMemoryPages, type MemoryAssetSlot } from './plan';

const ALL: ChapterId[] = ['morning', 'mission', 'vienna', 'tennis', 'spa', 'dinner'];

describe('memory album plan', () => {
  it('weaves family memories between the chapters', () => {
    const pages = planMemoryPages({
      photos: new Set(ALL.filter((c) => c !== 'vienna')),
      assets: new Set<MemoryAssetSlot>(['gradskiKlub', 'wedding', 'familyEarly', 'familyCurrent']),
      answers: { 'dinner.moment': 'Шетња', 'dinner.still': 'Смех', 'spa.lastDay': 'Не сећамо се', 'epilogue.takeaway': 'Мир' },
      completed: ALL,
    });
    expect(pages.map((p) => (p.kind === 'chapter' ? p.id : p.kind === 'memory' ? `memory:${p.slot}` : p.kind))).toEqual([
      'cover',
      'letter',
      'memory:gradskiKlub',
      'morning',
      'memory:wedding',
      'mission',
      'memory:familyEarly',
      'vienna',
      'tennis',
      'story',
      'spa',
      'dinner',
      'answers',
      'answers',
      'family',
      'closing',
    ]);
    expect(pages[0]).toEqual({ kind: 'cover', photo: 'dinner' });
  });

  it('still produces a complete album when every family photo and day photo is missing', () => {
    const pages = planMemoryPages({ photos: new Set(), assets: new Set(), answers: {}, completed: ['morning'] });
    expect(pages.map((p) => p.kind)).toEqual(['cover', 'letter', 'chapter', 'story', 'closing']);
    expect(pages[0]).toEqual({ kind: 'cover', photo: null });
  });

  it('ignores empty answers', () => {
    const pages = planMemoryPages({ photos: new Set(), assets: new Set(), answers: { 'dinner.moment': '   ' }, completed: [] });
    expect(pages.some((p) => p.kind === 'answers')).toBe(false);
  });
});
