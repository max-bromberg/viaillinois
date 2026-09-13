import { describe, it, expect } from 'vitest';
import { campusSky, skyAtHour, SKY_HOURS } from '../../src/lib/campusTime.js';

/**
 * Which sky is over the building.
 *
 * docs/design/11-implementation.md step 5: the sky reads the campus hour from
 * the same source the feed already uses to decide what is upcoming, so the band
 * and the agenda never disagree about what time it is. Two clocks on one page
 * is the bug this prevents: the band saying dusk while the agenda still counts
 * the afternoon.
 *
 * docs/design/04-color.md: between two hours the two skies crossfade over the
 * last thirty minutes of the earlier one.
 */
const at = (hour, minute = 0) =>
  `2026-09-10T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-05:00`;

describe('the sky at an hour', () => {
  it.each([
    [6, 'morning'], [8, 'morning'], [10, 'morning'],
    [11, 'afternoon'], [14, 'afternoon'], [16, 'afternoon'],
    [17, 'dusk'], [19, 'dusk'], [20, 'dusk'],
    [21, 'night'], [23, 'night'], [0, 'night'], [3, 'night'], [5, 'night'],
  ])('at %i is %s', (hour, sky) => {
    expect(skyAtHour(hour)).toBe(sky);
  });

  it('names its hours, so that the greeting and the band agree on them', () => {
    expect(SKY_HOURS).toEqual([
      { sky: 'morning', from: 6, until: 11 },
      { sky: 'afternoon', from: 11, until: 17 },
      { sky: 'dusk', from: 17, until: 21 },
      { sky: 'night', from: 21, until: 6 },
    ]);
  });
});

describe('the sky on campus', () => {
  it('reads the hour on campus, wherever the page is being read', () => {
    // Half past one in the morning in UTC is half past eight the evening before
    // on campus, which is dusk rather than night.
    expect(campusSky('2026-09-11T01:30:00Z').sky).toBe('dusk');
  });

  it('holds one sky steady through the middle of its hours', () => {
    for (const hour of [7, 8, 9, 12, 13, 18, 19, 22, 23, 2]) {
      expect(campusSky(at(hour)).blend, `at ${hour}`).toBe(0);
    }
  });

  it.each([
    [10, 'morning', 'afternoon'],
    [16, 'afternoon', 'dusk'],
    [20, 'dusk', 'night'],
    [5, 'night', 'morning'],
  ])('crossfades in the last half hour of the %i o clock hour, from %s to %s', (hour, sky, next) => {
    expect(campusSky(at(hour, 29)).blend).toBe(0);
    expect(campusSky(at(hour, 30)).sky).toBe(sky);
    expect(campusSky(at(hour, 30)).next).toBe(next);
    expect(campusSky(at(hour, 30)).blend).toBeCloseTo(0, 5);
    expect(campusSky(at(hour, 45)).blend).toBeCloseTo(0.5, 5);
    expect(campusSky(at(hour, 59)).blend).toBeGreaterThan(0.9);
  });

  it('has arrived at the next sky by the time the hour turns', () => {
    expect(campusSky(at(11, 0)).sky).toBe('afternoon');
    expect(campusSky(at(11, 0)).blend).toBe(0);
    expect(campusSky(at(6, 0)).sky).toBe('morning');
  });

  it('names the sky that comes next even when it is not fading yet', () => {
    expect(campusSky(at(8)).next).toBe('afternoon');
    expect(campusSky(at(23)).next).toBe('morning');
  });

  it('settles on the afternoon rather than nothing when it is given no time it can read', () => {
    expect(campusSky(null).sky).toBe('afternoon');
    expect(campusSky('not a time').blend).toBe(0);
  });
});
