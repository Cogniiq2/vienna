import { describe, expect, it } from 'vitest';
import { ASSET_SLOTS, family, hasMusicLinks } from './family';

describe('family config', () => {
  it('names the parents and the three children', () => {
    expect(family.parents.mother.name.sr).toBe('Милица');
    expect(family.parents.father.name.sr).toBe('Милош');
    expect(family.children.map((c) => c.name.sr)).toEqual(['Ђорђе', 'Богдана', 'Лазар']);
  });

  it('has a message slot per child and every slot is a known asset', () => {
    expect(family.familyMessages.map((m) => m.slot)).toEqual(['audioDjordje', 'audioBogdana', 'audioLazar']);
    for (const m of family.familyMessages) expect(ASSET_SLOTS).toContain(m.slot);
    for (const slot of Object.keys(family.memoryAssets)) expect(ASSET_SLOTS).toContain(slot);
  });

  it('hides music without links', () => {
    expect(hasMusicLinks(null)).toBe(false);
    expect(hasMusicLinks({ title: 'x', artist: 'y', spotifyUrl: null, appleMusicUrl: null, youtubeUrl: null })).toBe(false);
    expect(hasMusicLinks({ title: 'x', artist: 'y', spotifyUrl: 'https://open.spotify.com/x', appleMusicUrl: null, youtubeUrl: null })).toBe(true);
  });

  it('ships no private media in the repository by default', () => {
    expect(Object.values(family.memoryAssets).every((a) => a.src === null)).toBe(true);
    expect(family.familyVideo.src).toBeNull();
    expect(family.familyMessages.every((m) => m.src === null)).toBe(true);
  });
});
