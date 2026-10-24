import { describe, expect, it } from 'vitest';
import { formatClock, toRoman } from './format';
import { coverCrop, fitWithin, isProbablyImage } from './image';
import { mapsSearchUrl, navigationHref, safeHref } from './links';
import { isValidTokenFormat, parseTripToken } from './token';

describe('format', () => {
  it('renders roman numerals', () => {
    expect([1, 2, 3, 4, 5, 6, 9, 14].map(toRoman)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'IX', 'XIV']);
  });
  it('formats Vienna clock time', () => {
    expect(formatClock('2026-10-27T08:42:00.000Z', 'Europe/Vienna')).toBe('09:42');
    expect(formatClock('nope', 'Europe/Vienna')).toBeNull();
  });
});

describe('image math', () => {
  it('fits within the max edge without upscaling', () => {
    expect(fitWithin(4032, 3024, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
  it('computes a cover crop for portrait and landscape sources', () => {
    const landscape = coverCrop(4000, 3000, 1);
    expect(landscape).toMatchObject({ sx: 500, sy: 0, sw: 3000, sh: 3000 });
    const portrait = coverCrop(3000, 4000, 1.5);
    expect(portrait.sw).toBe(3000);
    expect(portrait.sh).toBe(2000);
    expect(portrait.sy).toBeCloseTo(760);
  });
  it('recognises images by type or extension', () => {
    expect(isProbablyImage({ type: 'image/heic', name: 'a' })).toBe(true);
    expect(isProbablyImage({ type: '', name: 'IMG_1.HEIC' })).toBe(true);
    expect(isProbablyImage({ type: 'application/pdf', name: 'a.pdf' })).toBe(false);
  });
});

describe('links', () => {
  it('only allows http(s) and relative links', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('')).toBeNull();
    expect(safeHref('//evil.com')).toBeNull();
    expect(safeHref('/t/ticket.pdf')).toBe('/t/ticket.pdf');
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a');
  });
  it('falls back to a maps search from the address', () => {
    expect(mapsSearchUrl('Ringstraße 1, Wien')).toContain('query=Ringstra%C3%9Fe%201%2C%20Wien');
    expect(navigationHref(null, null)).toBeNull();
    expect(navigationHref('https://maps.apple.com/?q=x', 'A')).toBe('https://maps.apple.com/?q=x');
  });
});

describe('token', () => {
  it('parses trip routes', () => {
    expect(parseTripToken('/trip/abc')).toBe('abc');
    expect(parseTripToken('/trip/abc/')).toBe('abc');
    expect(parseTripToken('/')).toBeNull();
    expect(parseTripToken('/trip/a/b')).toBeNull();
  });
  it('requires long, url-safe tokens', () => {
    expect(isValidTokenFormat('short')).toBe(false);
    expect(isValidTokenFormat('A'.repeat(32))).toBe(true);
    expect(isValidTokenFormat(`${'A'.repeat(31)}!`)).toBe(false);
  });
});
