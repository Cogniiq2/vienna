import { afterEach, describe, expect, it } from 'vitest';
import { forceEpilogue, isEpilogueAvailable } from './epilogue';

describe('epilogue', () => {
  afterEach(() => sessionStorage.clear());

  it('appears only on Wednesday morning in Vienna', () => {
    expect(isEpilogueAvailable(Date.parse('2026-10-27T21:00:00+01:00'))).toBe(false);
    expect(isEpilogueAvailable(Date.parse('2026-10-28T05:59:00+01:00'))).toBe(false);
    expect(isEpilogueAvailable(Date.parse('2026-10-28T06:00:00+01:00'))).toBe(true);
  });

  it('can be forced for testing', () => {
    forceEpilogue();
    expect(isEpilogueAvailable(Date.parse('2026-10-01T00:00:00Z'))).toBe(true);
  });
});
