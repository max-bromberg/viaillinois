import { describe, it, expect } from 'vitest';
import { campusDayName, campusShortDate } from '../../src/lib/campusTime.js';

/**
 * How the site names a day.
 *
 * docs/design/10-voice.md: days are "Today", "Tomorrow", then the weekday name
 * for the next five days, then "Thu Sep 17" beyond that. The agenda, the clock
 * under the sky band and the kiosk rail all name days, and a student reading
 * "Thursday" in one place and "Thu Sep 17" in another for the same day would be
 * reading two different sites.
 */
const TODAY = '2026-09-10T09:00:00-05:00';

describe('the name of a day', () => {
  it.each([
    ['2026-09-10T18:00:00-05:00', 'Today'],
    ['2026-09-11T18:00:00-05:00', 'Tomorrow'],
    ['2026-09-12T18:00:00-05:00', 'Saturday'],
    ['2026-09-13T18:00:00-05:00', 'Sunday'],
    ['2026-09-16T18:00:00-05:00', 'Wednesday'],
  ])('calls %s %s', (when, expected) => {
    expect(campusDayName(when, TODAY)).toBe(expected);
  });

  it('gives the date beyond the next five days, because a weekday name stops helping', () => {
    expect(campusDayName('2026-09-17T18:00:00-05:00', TODAY)).toBe('Thu Sep 17');
    expect(campusDayName('2026-10-02T18:00:00-05:00', TODAY)).toBe('Fri Oct 2');
  });

  it('names a day that has already gone by its date', () => {
    expect(campusDayName('2026-09-09T18:00:00-05:00', TODAY)).toBe('Wed Sep 9');
  });

  it('reads the day on campus, not in the reader own zone', () => {
    // Late on the tenth in Urbana is already the eleventh in UTC.
    expect(campusDayName('2026-09-11T02:30:00Z', TODAY)).toBe('Today');
  });

  it('is empty for a time it cannot read', () => {
    expect(campusDayName(null, TODAY)).toBe('');
    expect(campusDayName('not a time', TODAY)).toBe('');
  });
});

describe('a short date', () => {
  it('is written without a comma, as the voice document writes it', () => {
    expect(campusShortDate('2026-09-10T18:00:00-05:00')).toBe('Thu Sep 10');
  });

  it('is empty for a time it cannot read', () => {
    expect(campusShortDate(null)).toBe('');
  });
});
