import { describe, expect, it } from 'vitest';
import type { AssetSlot } from '../config/family';
import { sr } from '../content/sr';
import { resolveTodaySource, visibleFrames } from './frames';

const none = () => false;
const only = (...slots: AssetSlot[]) => (s: AssetSlot) => slots.includes(s);

describe('story frames', () => {
  it('ends Tuesday quietly: without a family photo only text + signature remain', () => {
    const frames = visibleFrames(sr.finale.closing, { photos: {} }, none);
    expect(frames.some((f) => f.asset)).toBe(false);
    expect(frames.find((f) => f.lines.length === 0 && !f.signature)).toBeUndefined();
    expect(frames.at(-1)?.signature).toBe(true);
  });

  it('shows the family photo at the very end of Tuesday once it is uploaded', () => {
    const frames = visibleFrames(sr.finale.closing, { photos: {} }, only('familyCurrent'));
    expect(frames.filter((f) => f.asset).map((f) => f.asset)).toEqual(['familyCurrent']);
  });

  it('drops photo-only frames of the family story when photos are missing', () => {
    const frames = visibleFrames(sr.interludes.wedding, { photos: {} }, none);
    expect(frames.every((f) => !f.asset)).toBe(true);
  });

  it('keeps archival photos that exist', () => {
    const frames = visibleFrames(sr.interludes.gradskiKlub, { photos: {} }, only('gradskiKlub'));
    expect(frames[1]?.asset).toBe('gradskiKlub');
  });

  it('uses the parents photo, then tonight’s dinner photo, for „ви сте Милица и Милош.“', () => {
    const dinner = { chapterId: 'dinner' as const, capturedAt: '', status: 'local' as const, remotePath: null, hasLocal: true };
    expect(resolveTodaySource({ photos: {} }, only('parentsCurrent'))).toEqual({ kind: 'asset', slot: 'parentsCurrent' });
    expect(resolveTodaySource({ photos: { dinner } }, none)).toEqual({ kind: 'photo', chapterId: 'dinner' });
    expect(resolveTodaySource({ photos: {} }, none)).toBeNull();
  });
});

describe('finale flow', () => {
  it('ends Tuesday with letter → closing → album', async () => {
    const { nextFinaleStage } = await import('./frames');
    expect(nextFinaleStage([])).toBe('letter');
    expect(nextFinaleStage(['finale:letter'])).toBe('closing');
    expect(nextFinaleStage(['finale:letter', 'finale:closing'])).toBeNull();
  });

  it('offers the family story only when there is material beyond the current family photo', async () => {
    const { hasFamilyStory } = await import('./frames');
    expect(hasFamilyStory(none)).toBe(false);
    expect(hasFamilyStory(only('familyCurrent'))).toBe(false);
    expect(hasFamilyStory(only('wedding'))).toBe(true);
    expect(hasFamilyStory(only('audioLazar'))).toBe(true);
    expect(hasFamilyStory(only('familyVideo'))).toBe(true);
  });
});
