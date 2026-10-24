import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../config/chapters';
import { de } from './de';
import { MOTIF } from './types';

const ASSET_KEYS = ['gradskiKlub', 'wedding', 'familyEarly', 'familyCurrent', 'parentsToday', 'parentsNow'];
import { sr } from './sr';

type Shape = string | number | boolean | null | Shape[] | { [k: string]: Shape };

/** Struktur-Signatur: Keys + Array-Längen, ohne die Texte selbst. */
function shape(value: unknown): Shape {
  if (typeof value === 'function') return 'fn';
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, shape((value as Record<string, unknown>)[k])]),
    );
  }
  return typeof value;
}

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

describe('i18n', () => {
  it('Serbian and German dictionaries have exactly the same structure', () => {
    expect(shape(de)).toEqual(shape(sr));
  });

  it('Serbian is written in Cyrillic (no accidental Latin sentences)', () => {
    const allowed = new Set(['Vienna Open', 'sr-Cyrl', 'Spotify', 'Apple Music', 'YouTube', ...ASSET_KEYS]);
    const latinOnly = strings(sr).filter(
      (s) => /[a-z]{4,}/i.test(s) && !/[\u0400-\u04FF]/.test(s) && !allowed.has(s) && !/^Bec-.*\.pdf$/.test(s),
    );
    expect(latinOnly).toEqual([]);
  });

  it('has no empty strings', () => {
    expect(strings(sr).filter((s) => !s.trim())).toEqual([]);
    expect(strings(de).filter((s) => !s.trim())).toEqual([]);
  });

  it('defines content for every chapter and a CTA for chapters without required photo', () => {
    for (const chapter of CHAPTERS) {
      expect(sr.chapters[chapter.id].title).toBeTruthy();
      if (!chapter.photoRequired) {
        expect(sr.chapters[chapter.id].completeCta).toBeTruthy();
        expect(de.chapters[chapter.id].completeCta).toBeTruthy();
      }
    }
  });

  it('stays within the six-chapter rule', () => {
    expect(CHAPTERS).toHaveLength(6);
  });

  it('keeps the family motif untranslated and uses it sparingly', () => {
    const count = (d: unknown) => strings(d).filter((x) => x.includes(MOTIF)).length;
    expect(MOTIF).toBe('Јел’ знате?');
    expect(count(sr)).toBe(1);
    expect(count(de)).toBe(1);
    expect(sr.finale.bonus.some((f) => f.lines.includes(MOTIF))).toBe(true);
    expect(de.finale.bonus.some((f) => f.lines.includes(MOTIF))).toBe(true);
  });

  it('never explains the motif', () => {
    const all = [...strings(sr), ...strings(de)].join(' ').toLowerCase();
    expect(all).not.toMatch(/волим те|ich liebe dich|bedeutet|значи/);
  });

  it('addresses Mama & Tata in German too', () => {
    expect(de.opening.dedication).toContain('Tata');
    expect(strings(de).some((x) => /\bPapa\b/.test(x))).toBe(false);
  });
});
