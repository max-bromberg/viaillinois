import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spy on console.warn to verify unknown code logging
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

import { resolveBuilding, resolveRoom, drainUnknownCodes } from '../../lib/locationNormalizer.js';

beforeEach(() => {
  drainUnknownCodes();
});

describe('resolveBuilding()', () => {
  it('maps known Ad Astra code (with campus prefix) to canonical name', () => {
    expect(resolveBuilding('1ECEB')).toBe('Electrical & Computer Eng Bldg');
  });

  it('maps known Ad Astra code without prefix to canonical name', () => {
    expect(resolveBuilding('ECEB')).toBe('Electrical & Computer Eng Bldg');
  });

  it('returns code as-is for unknown Ad Astra short code and logs warning', () => {
    warnSpy.mockClear();
    const result = resolveBuilding('1NSRC');
    expect(result).toBe('NSRC');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown building code: NSRC')
    );
  });

  it('returns trimmed full name for non-code input (Tableau/Course Explorer)', () => {
    expect(resolveBuilding('  Electrical & Computer Eng Bldg  ')).toBe('Electrical & Computer Eng Bldg');
  });

  it('HTML-decodes ampersand entities in full names', () => {
    expect(resolveBuilding('Electrical &amp; Computer Eng Bldg')).toBe('Electrical & Computer Eng Bldg');
  });

  it('returns empty string for empty input', () => {
    expect(resolveBuilding('')).toBe('');
  });
});

describe('resolveRoom()', () => {
  it('trims whitespace from room number', () => {
    expect(resolveRoom('  3002 ')).toBe('3002');
  });

  it('returns empty string for empty input', () => {
    expect(resolveRoom('')).toBe('');
  });
});

describe('drainUnknownCodes()', () => {
  it('returns codes accumulated since last drain', () => {
    drainUnknownCodes(); // clear any state from prior tests
    resolveBuilding('1NSRC');
    resolveBuilding('1FAKE');
    const codes = drainUnknownCodes();
    expect(codes).toContain('NSRC');
    expect(codes).toContain('FAKE');
  });

  it('clears the collector so a second drain returns empty', () => {
    drainUnknownCodes();
    resolveBuilding('1NSRC');
    drainUnknownCodes();
    expect(drainUnknownCodes()).toHaveLength(0);
  });

  it('does not include known codes', () => {
    drainUnknownCodes();
    resolveBuilding('1ECEB'); // known — maps to 'Electrical & Computer Eng Bldg'
    expect(drainUnknownCodes()).toHaveLength(0);
  });

  it('does not include full-name (non-code) inputs', () => {
    drainUnknownCodes();
    resolveBuilding('Electrical & Computer Eng Bldg'); // full name, not a short code
    expect(drainUnknownCodes()).toHaveLength(0);
  });

  it('deduplicates repeated occurrences of the same unknown code', () => {
    resolveBuilding('1NSRC');
    resolveBuilding('1NSRC');
    const codes = drainUnknownCodes();
    expect(codes.filter(c => c === 'NSRC')).toHaveLength(1);
  });
});
