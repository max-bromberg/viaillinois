import { describe, it, expect } from 'vitest';
import {
  expandOccurrences, parseRecurrenceRule, timeOfDay, durationMinutes, MAX_OCCURRENCES,
} from '../../lib/recurrence.js';

const WEEKLY_MEETING = {
  startTime: '2026-09-01 18:00:00',   // a Tuesday
  endTime:   '2026-09-01 19:30:00',
  intervalWeeks: 1,
  daysOfWeek: ['Tue'],
  startsOn: '2026-09-01',
  endsOn:   '2026-09-29',
};

const starts = occurrences => occurrences.map(o => o.start);

describe('expandOccurrences', () => {
  it('repeats weekly from the first date to the last', () => {
    expect(starts(expandOccurrences(WEEKLY_MEETING))).toEqual([
      '2026-09-01 18:00:00',
      '2026-09-08 18:00:00',
      '2026-09-15 18:00:00',
      '2026-09-22 18:00:00',
      '2026-09-29 18:00:00',
    ]);
  });

  it('keeps the length of the event on every occurrence', () => {
    for (const occurrence of expandOccurrences(WEEKLY_MEETING)) {
      expect(durationMinutes(occurrence.start, occurrence.end)).toBe(90);
    }
  });

  it('repeats every other week when the interval says so', () => {
    expect(starts(expandOccurrences({ ...WEEKLY_MEETING, intervalWeeks: 2 }))).toEqual([
      '2026-09-01 18:00:00',
      '2026-09-15 18:00:00',
      '2026-09-29 18:00:00',
    ]);
  });

  it('repeats on every day of the week it was given, in order', () => {
    const occurrences = expandOccurrences({
      ...WEEKLY_MEETING, daysOfWeek: ['Tue', 'Thu'], endsOn: '2026-09-15',
    });
    expect(starts(occurrences)).toEqual([
      '2026-09-01 18:00:00',
      '2026-09-03 18:00:00',
      '2026-09-08 18:00:00',
      '2026-09-10 18:00:00',
      '2026-09-15 18:00:00',
    ]);
  });

  /**
   * An organizer picks a Monday on the form and then asks for Tuesdays. The
   * first occurrence is the first Tuesday from then on, not the Monday.
   */
  it('begins on the first listed weekday on or after the start date', () => {
    const occurrences = expandOccurrences({
      ...WEEKLY_MEETING, startsOn: '2026-08-31', endsOn: '2026-09-15',
    });
    expect(starts(occurrences)[0]).toBe('2026-09-01 18:00:00');
  });

  it('leaves out the weeks the term is not running', () => {
    const occurrences = expandOccurrences({
      ...WEEKLY_MEETING,
      skip: [{ name: 'Break', start: '2026-09-14', end: '2026-09-20' }],
    });
    expect(starts(occurrences)).not.toContain('2026-09-15 18:00:00');
    expect(starts(occurrences)).toHaveLength(4);
  });

  it('leaves out the dates a calendar file excluded', () => {
    const occurrences = expandOccurrences({ ...WEEKLY_MEETING, exclude: ['2026-09-08'] });
    expect(starts(occurrences)).not.toContain('2026-09-08 18:00:00');
    expect(starts(occurrences)).toHaveLength(4);
  });

  it('stops after the number of occurrences a rule asked for', () => {
    expect(expandOccurrences({ ...WEEKLY_MEETING, endsOn: '2026-12-31', count: 3 })).toHaveLength(3);
  });

  /**
   * Six in the evening is six in the evening on both sides of the day the
   * clocks change. Stored times are campus wall clock, so this holds by
   * construction, and it is one of the reasons they are stored that way.
   */
  it('holds the hour across the day the clocks change', () => {
    const occurrences = expandOccurrences({
      ...WEEKLY_MEETING,
      startTime: '2026-10-27 18:00:00', endTime: '2026-10-27 19:00:00',
      startsOn: '2026-10-27', endsOn: '2026-11-03',
    });
    expect(starts(occurrences)).toEqual(['2026-10-27 18:00:00', '2026-11-03 18:00:00']);
  });

  it('carries an event that runs past midnight into the next day', () => {
    const occurrences = expandOccurrences({
      ...WEEKLY_MEETING,
      startTime: '2026-09-01 23:00:00', endTime: '2026-09-02 01:00:00',
      endsOn: '2026-09-08',
    });
    expect(occurrences[1]).toEqual({
      date: '2026-09-08', start: '2026-09-08 23:00:00', end: '2026-09-09 01:00:00',
    });
  });

  it('produces nothing when the range holds no listed weekday', () => {
    expect(expandOccurrences({
      ...WEEKLY_MEETING, startsOn: '2026-09-02', endsOn: '2026-09-05', daysOfWeek: ['Mon'],
    })).toEqual([]);
  });

  it('refuses to produce an unbounded number of rows', () => {
    const occurrences = expandOccurrences({
      ...WEEKLY_MEETING,
      daysOfWeek: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], endsOn: '2030-01-01',
    });
    expect(occurrences).toHaveLength(MAX_OCCURRENCES);
  });
});

describe('parseRecurrenceRule', () => {
  it('reads a weekly rule and the day it falls on', () => {
    expect(parseRecurrenceRule('FREQ=WEEKLY;BYDAY=TU')).toMatchObject({
      frequency: 'weekly', intervalWeeks: 1, daysOfWeek: ['Tue'],
    });
  });

  it('reads an interval and several days', () => {
    expect(parseRecurrenceRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH')).toMatchObject({
      intervalWeeks: 2, daysOfWeek: ['Tue', 'Thu'],
    });
  });

  it('reads the days in the order the week runs, whatever order the rule lists them in', () => {
    expect(parseRecurrenceRule('FREQ=WEEKLY;BYDAY=TH,MO').daysOfWeek).toEqual(['Mon', 'Thu']);
  });

  it('reads a count', () => {
    expect(parseRecurrenceRule('FREQ=WEEKLY;COUNT=6;BYDAY=MO').count).toBe(6);
  });

  it('reads an end date, whether it carries a time or not', () => {
    expect(parseRecurrenceRule('FREQ=WEEKLY;UNTIL=20261209T235959Z;BYDAY=WE').until).toBe('2026-12-09');
    expect(parseRecurrenceRule('FREQ=WEEKLY;UNTIL=20261209;BYDAY=WE').until).toBe('2026-12-09');
  });

  /**
   * RFC 5545 says a weekly rule with no BYDAY repeats on the weekday its start
   * falls on, and plenty of exported calendars leave it out.
   */
  it('falls back to the weekday of the event when the rule names no day', () => {
    expect(parseRecurrenceRule('FREQ=WEEKLY', { startDate: '2026-09-01' }).daysOfWeek).toEqual(['Tue']);
  });

  it('reads a rule written in lower case, and one with spaces around it', () => {
    expect(parseRecurrenceRule(' freq=weekly;byday=fr ').daysOfWeek).toEqual(['Fri']);
  });

  /**
   * Monthly and yearly rules are out of scope. Saying so is the point: the
   * importer reports them rather than silently importing one week of a series.
   */
  it('refuses a frequency it does not expand', () => {
    expect(parseRecurrenceRule('FREQ=MONTHLY;BYMONTHDAY=1')).toBeNull();
    expect(parseRecurrenceRule('FREQ=DAILY')).toBeNull();
    expect(parseRecurrenceRule('')).toBeNull();
    expect(parseRecurrenceRule(null)).toBeNull();
  });

  it('refuses a weekly rule with an interval it cannot read', () => {
    expect(parseRecurrenceRule('FREQ=WEEKLY;INTERVAL=0;BYDAY=MO')).toBeNull();
  });
});

describe('timeOfDay and durationMinutes', () => {
  it('reads the hour an event starts at', () => {
    expect(timeOfDay('2026-09-01 18:30:00')).toBe('18:30:00');
  });

  it('measures how long an event runs, over midnight as well', () => {
    expect(durationMinutes('2026-09-01 18:00:00', '2026-09-01 19:30:00')).toBe(90);
    expect(durationMinutes('2026-09-01 23:00:00', '2026-09-02 01:00:00')).toBe(120);
  });
});
