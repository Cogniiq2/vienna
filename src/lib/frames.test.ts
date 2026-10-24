import { describe, expect, it } from 'vitest';
import type { AssetSlot } from '../config/family';
import { sr } from '../content/sr';
import { resolveTodaySource, visibleFrames } from './frames';

const none = () => false;
const only = (...slots: AssetSlot[]) => (s: AssetSlot) => slots.includes(s);

describe('story frames', () => {
  it('drops photo-only frames when the photo is missing but keeps text', () => {
    const frames = visibleFrames(sr.finale.bonus, { photos: {} }, none);
    expect(frames.some((f) => f.asset)).toBe(false);
    expect(frames.find((f) => f.lines.length === 0 && !f.signature)).toBeUndefined();
    expect(frames.at(-1)?.signature).toBe(true);
  });

  it('keeps archival photos that exist', () => {
    const frames = visibleFrames(sr.interludes.gradskiKlub, { photos: {} }, only('gradskiKlub'));
    expect(frames[1]?.asset).toBe('gradskiKlub');
  });

  it('uses the parents photo, then tonight’s dinner photo, for „ви сте Милица и Милош.“', () => {
    const dinner = { chapterId: 'dinner' as const, capturedAt: '', status: 'local' as const, remotePath: null, hasLocal: true };
    expect(resolveTodaySource({ photos: {} }, only('parentsNow'))).toEqual({ kind: 'asset', slot: 'parentsNow' });
    expect(resolveTodaySource({ photos: { dinner } }, none)).toEqual({ kind: 'photo', chapterId: 'dinner' });
    expect(resolveTodaySource({ photos: {} }, none)).toBeNull();
  });
});

describe('finale flow', () => {
  it('goes letter → media → bonus → album', async () => {
    const { nextFinaleStage } = await import('./frames');
    expect(nextFinaleStage([], true)).toBe('more');
    expect(nextFinaleStage(['finale:more'], true)).toBe('messages');
    expect(nextFinaleStage(['finale:more'], false)).toBe('bonus');
    expect(nextFinaleStage(['finale:more', 'finale:messages'], true)).toBe('bonus');
    expect(nextFinaleStage(['finale:more', 'finale:messages', 'finale:bonus'], true)).toBeNull();
  });
});
