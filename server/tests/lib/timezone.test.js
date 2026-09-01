import { describe, it, expect } from 'vitest';
import { toIsoWithOffset } from '../../lib/timezone.js';

/**
 * Event times are stored as wall clock with no zone, because that is what the
 * organizer typed and what people read. Anything published for a machine, a
 * sitemap or an Event listing, has to carry the offset or it is ambiguous by
 * an hour twice a year and by six hours to anyone reading it as UTC.
 */
describe('toIsoWithOffset', () => {
  it('uses central daylight time in summer', () => {
    expect(toIsoWithOffset('2026-07-15 18:00:00')).toBe('2026-07-15T18:00:00-05:00');
  });

  it('uses central standard time in winter', () => {
    expect(toIsoWithOffset('2026-01-15 18:00:00')).toBe('2026-01-15T18:00:00-06:00');
  });

  it('is right on the day the clocks go forward', () => {
    expect(toIsoWithOffset('2026-03-08 12:00:00')).toBe('2026-03-08T12:00:00-05:00');
    expect(toIsoWithOffset('2026-03-07 12:00:00')).toBe('2026-03-07T12:00:00-06:00');
  });

  it('is right on the day the clocks go back', () => {
    expect(toIsoWithOffset('2026-11-01 12:00:00')).toBe('2026-11-01T12:00:00-06:00');
    expect(toIsoWithOffset('2026-10-31 12:00:00')).toBe('2026-10-31T12:00:00-05:00');
  });

  it('accepts a value that already has a T in it', () => {
    expect(toIsoWithOffset('2026-07-15T18:00:00')).toBe('2026-07-15T18:00:00-05:00');
  });

  it('accepts a Date, which is what the driver sometimes returns', () => {
    expect(toIsoWithOffset(new Date(Date.UTC(2026, 6, 15, 23, 0, 0)))).toBe('2026-07-15T18:00:00-05:00');
  });

  it('returns nothing for a value it cannot read', () => {
    expect(toIsoWithOffset(null)).toBeNull();
    expect(toIsoWithOffset('not a date')).toBeNull();
  });
});
