import { describe, it, expect } from 'vitest';
import {
  campusDate, campusTime, campusDateTime, campusFields,
  campusStartOfDay, campusToday, toDateTimeLocal, isSameCampusDay,
  calendarDayKey, campusTodayMarker, fallsOnDay,
} from '../../src/lib/campusTime.js';

/**
 * VIA serves one campus, so every time it shows is that campus's time. Left to
 * the browser, the same event read from a laptop at home over the winter break
 * showed a different hour than it did from a lecture hall, and the page gave no
 * clue which of the two was the hour to turn up at.
 *
 * The API sends each time with the campus offset on it, so these read one
 * instant and render it back on the campus clock wherever the reader is.
 */
const SUMMER = '2026-07-15T18:00:00-05:00';
const WINTER = '2026-01-15T18:00:00-06:00';

describe('campus time rendering', () => {
  it('shows the campus hour for a summer evening', () => {
    expect(campusTime(SUMMER)).toBe('6:00 PM');
  });

  it('shows the campus hour for a winter evening', () => {
    expect(campusTime(WINTER)).toBe('6:00 PM');
  });

  it('shows the campus hour whatever zone the reader is in', () => {
    // The same instant, written from Tokyo's point of view. A reader there must
    // still be told the hour the exam starts in Champaign.
    expect(campusTime('2026-07-16T08:00:00+09:00')).toBe('6:00 PM');
  });

  it('shows the campus date, which can be the day before the one the reader is having', () => {
    // Half past nine in the evening on campus is already tomorrow in London.
    expect(campusDate('2026-07-15T21:30:00-05:00')).toBe('Wed, Jul 15');
  });

  it('renders a date and time together', () => {
    expect(campusDateTime(SUMMER)).toBe('Wed, Jul 15 at 6:00 PM');
  });

  it('takes the format options it is given', () => {
    expect(campusDate(SUMMER, { weekday: 'long', month: 'long', day: 'numeric' }))
      .toBe('Wednesday, July 15');
  });

  it('reads a bare wall clock as campus time, which is what it is', () => {
    expect(campusTime('2026-07-15 18:00:00')).toBe('6:00 PM');
  });

  it('gives back nothing for a value it cannot read', () => {
    expect(campusTime(null)).toBe('');
    expect(campusDate(undefined)).toBe('');
    expect(campusDateTime('not a date')).toBe('');
  });
});

describe('campusFields', () => {
  it('reports the campus clock fields, which is what a week grid positions by', () => {
    expect(campusFields(SUMMER)).toMatchObject({ year: 2026, month: 7, day: 15, hour: 18, minute: 0 });
  });

  it('reports the campus day for an instant that is already tomorrow elsewhere', () => {
    expect(campusFields('2026-07-15T23:30:00-05:00')).toMatchObject({ day: 15, hour: 23 });
  });

  it('gives back nothing for a value it cannot read', () => {
    expect(campusFields('not a date')).toBeNull();
  });
});

describe('campus days', () => {
  it('places two times on the same campus day', () => {
    expect(isSameCampusDay('2026-07-15T09:00:00-05:00', '2026-07-15T23:00:00-05:00')).toBe(true);
  });

  it('separates two times that fall on different campus days', () => {
    expect(isSameCampusDay('2026-07-15T23:00:00-05:00', '2026-07-16T01:00:00-05:00')).toBe(false);
  });

  it('reports the campus date as a plain day string', () => {
    expect(campusStartOfDay('2026-07-15T23:30:00-05:00')).toBe('2026-07-15');
  });

  it('reports today on campus as a plain day string', () => {
    expect(campusToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('toDateTimeLocal', () => {
  /**
   * An edit form has to be filled with the wall clock the organizer typed, or
   * saving an untouched form would move the event by the reader's offset.
   */
  it('fills a datetime-local input with the campus wall clock', () => {
    expect(toDateTimeLocal(SUMMER)).toBe('2026-07-15T18:00');
  });

  it('fills it from a bare wall clock unchanged', () => {
    expect(toDateTimeLocal('2026-07-15 18:00:00')).toBe('2026-07-15T18:00');
  });

  it('gives back nothing when there is no time to fill in', () => {
    expect(toDateTimeLocal(null)).toBe('');
  });
});

/**
 * A calendar column is a day, not an instant. It is carried as a Date at local
 * midnight so that the existing day arithmetic keeps working, and read back by
 * its calendar fields rather than by converting it to a zone, which would slide
 * it to the day before for any reader west of UTC.
 */
describe('calendar day markers', () => {
  it('reads a day marker by the calendar date it stands for', () => {
    expect(calendarDayKey(new Date(2026, 6, 15))).toBe('2026-07-15');
  });

  it('gives a marker for today on campus', () => {
    const marker = campusTodayMarker();
    expect(calendarDayKey(marker)).toBe(campusToday());
  });

  it('puts an evening event on the campus day its column stands for', () => {
    expect(fallsOnDay('2026-07-15T21:30:00-05:00', new Date(2026, 6, 15))).toBe(true);
  });

  it('keeps a late night event off the following column', () => {
    expect(fallsOnDay('2026-07-15T23:30:00-05:00', new Date(2026, 6, 16))).toBe(false);
  });

  it('reads a plain date string as the day it names, not as UTC midnight', () => {
    expect(campusStartOfDay('2026-07-15')).toBe('2026-07-15');
  });
});
