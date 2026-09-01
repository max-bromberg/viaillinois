import { describe, it, expect } from 'vitest';
import { toIsoWithOffset, toCampusWallClock, campusNow, campusStartOfToday } from '../../lib/timezone.js';

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

/**
 * The database clock is not the campus clock. MySQL runs in whatever zone its
 * container was started in, so NOW() cannot be compared against a wall clock
 * event time without being six hours out for half the year. Every comparison
 * against a stored time is made against a campus wall clock computed here.
 */
describe('toCampusWallClock', () => {
  it('reads an instant as central daylight time in summer', () => {
    expect(toCampusWallClock(new Date(Date.UTC(2026, 6, 15, 23, 0, 0)))).toBe('2026-07-15 18:00:00');
  });

  it('reads an instant as central standard time in winter', () => {
    expect(toCampusWallClock(new Date(Date.UTC(2026, 0, 16, 0, 0, 0)))).toBe('2026-01-15 18:00:00');
  });

  it('rolls the date back when campus is still on the previous day', () => {
    expect(toCampusWallClock(new Date(Date.UTC(2026, 6, 16, 2, 30, 0)))).toBe('2026-07-15 21:30:00');
  });

  it('renders midnight as 00, not as 24', () => {
    expect(toCampusWallClock(new Date(Date.UTC(2026, 6, 15, 5, 0, 0)))).toBe('2026-07-15 00:00:00');
  });
});

describe('campusNow', () => {
  it('is the campus wall clock for the instant it is given', () => {
    expect(campusNow(new Date(Date.UTC(2026, 6, 15, 23, 0, 0)))).toBe('2026-07-15 18:00:00');
  });

  it('defaults to the present, in a shape MySQL compares against a datetime', () => {
    expect(campusNow()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe('campusStartOfToday', () => {
  it('is midnight on the campus date, not on the date where the server runs', () => {
    // Late evening on campus is already the next day in UTC. The day that has
    // begun is the campus one.
    expect(campusStartOfToday(new Date(Date.UTC(2026, 6, 16, 2, 30, 0)))).toBe('2026-07-15 00:00:00');
  });

  it('rolls over at campus midnight', () => {
    expect(campusStartOfToday(new Date(Date.UTC(2026, 6, 16, 5, 30, 0)))).toBe('2026-07-16 00:00:00');
  });
});
