import { describe, expect, it } from 'vitest';
import { clampLines, sanitizeForFont, wrapText } from './layout';

const measure = (s: string) => s.length;

describe('pdf layout', () => {
  it('wraps words within the max width', () => {
    expect(wrapText('Добро јутро, Беч. Данас нигде не журите.', measure, 18)).toEqual([
      'Добро јутро, Беч.',
      'Данас нигде не',
      'журите.',
    ]);
  });
  it('hard-breaks very long words and keeps explicit newlines', () => {
    expect(wrapText('abcdefghij\nxy', measure, 4)).toEqual(['abcd', 'efgh', 'ij', 'xy']);
  });
  it('clamps lines with an ellipsis', () => {
    expect(clampLines(['eins zwei', 'drei vier', 'fünf'], 2, measure, 9)).toEqual(['eins zwei', 'drei vie…']);
  });
  it('removes glyphs missing in the font (e.g. emoji)', () => {
    expect(sanitizeForFont('Волимо вас ❤️', (cp) => cp < 0x2000)).toBe('Волимо вас');
  });
});
