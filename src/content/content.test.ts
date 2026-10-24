import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../config/chapters';
import { de } from './de';
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
    const latinOnly = strings(sr).filter(
      (s) => /[a-z]{4,}/i.test(s) && !/[Ѐ-ӿ]/.test(s) && !/^(Vienna Open|sr-Cyrl|Bec-.*\.pdf)$/.test(s),
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
});
