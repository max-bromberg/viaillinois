import { describe, it, expect } from 'vitest';
import { planSeries, splitByBusyRoom } from '../../services/recurringEvents.js';

const TERM = {
  code: '2026-fa',
  label: 'Fall 2026',
  instructionStart: '2026-08-24',
  instructionEnd: '2026-12-09',
  breaks: [{ name: 'Thanksgiving break', start: '2026-11-25', end: '2026-11-29' }],
};

const MEETING = { startTime: '2026-09-01 18:00:00', endTime: '2026-09-01 19:30:00' };

describe('planSeries', () => {
  it('describes the rule it was given, ready to store', () => {
    const { series } = planSeries({
      ...MEETING,
      recurrence: { days_of_week: ['Tue'], ends_on: '2026-09-29' },
      term: TERM,
    });
    expect(series).toMatchObject({
      frequency: 'weekly',
      interval_weeks: 1,
      days_of_week: 'Tue',
      starts_on: '2026-09-01',
      start_of_day: '18:00:00',
      duration_minutes: 90,
    });
  });

  it('runs to the end of instruction when no end date is given', () => {
    const { series, occurrences } = planSeries({
      ...MEETING, recurrence: { days_of_week: ['Tue'] }, term: TERM,
    });
    expect(occurrences.at(-1).date).toBe('2026-12-08');
    expect(series.ends_on).toBe('2026-12-08');
  });

  /**
   * The stored end is the last occurrence rather than the date the organizer
   * typed, so what the page says a series runs until is a date it runs on.
   */
  it('ends the series on its last occurrence, not on the date that was asked for', () => {
    const { series } = planSeries({
      ...MEETING, recurrence: { days_of_week: ['Tue'], ends_on: '2026-09-30' }, term: TERM,
    });
    expect(series.ends_on).toBe('2026-09-29');
  });

  it('skips the weeks the term is not running', () => {
    const { occurrences } = planSeries({
      ...MEETING, recurrence: { days_of_week: ['Wed'] }, term: TERM,
    });
    expect(occurrences.map(o => o.date)).not.toContain('2026-11-25');
    expect(occurrences.map(o => o.date)).toContain('2026-11-18');
    expect(occurrences.map(o => o.date)).toContain('2026-12-02');
  });

  it('repeats on the weekday the event starts on when no day is named', () => {
    const { series } = planSeries({ ...MEETING, recurrence: {}, term: TERM });
    expect(series.days_of_week).toBe('Tue');
  });

  it('reads the days as a list or as the string the database holds', () => {
    const asList = planSeries({ ...MEETING, recurrence: { days_of_week: ['Tue', 'Thu'] }, term: TERM });
    const asText = planSeries({ ...MEETING, recurrence: { days_of_week: 'Tue,Thu' }, term: TERM });
    expect(asList.series.days_of_week).toBe('Tue,Thu');
    expect(asText.series.days_of_week).toBe('Tue,Thu');
  });

  it('every other week is an interval, and every occurrence keeps the hour and the length', () => {
    const { series, occurrences } = planSeries({
      ...MEETING,
      recurrence: { days_of_week: ['Tue'], interval_weeks: 2, ends_on: '2026-09-29' },
      term: TERM,
    });
    expect(series.interval_weeks).toBe(2);
    expect(occurrences.map(o => o.start)).toEqual([
      '2026-09-01 18:00:00', '2026-09-15 18:00:00', '2026-09-29 18:00:00',
    ]);
    expect(occurrences.every(o => o.end.endsWith('19:30:00'))).toBe(true);
  });

  it('refuses a repeat that would produce nothing', () => {
    const { error } = planSeries({
      ...MEETING,
      recurrence: { days_of_week: ['Mon'], starts_on: '2026-09-01', ends_on: '2026-09-03' },
      term: TERM,
    });
    expect(error).toMatch(/no events/i);
  });

  it('refuses an end date before the start', () => {
    const { error } = planSeries({
      ...MEETING, recurrence: { days_of_week: ['Tue'], ends_on: '2026-08-01' }, term: TERM,
    });
    expect(error).toMatch(/before/i);
  });

  it('refuses a day of the week it does not recognise', () => {
    const { error } = planSeries({
      ...MEETING, recurrence: { days_of_week: ['Someday'] }, term: TERM,
    });
    expect(error).toMatch(/day of the week/i);
  });

  it('refuses an interval that is not a whole number of weeks it can hold', () => {
    expect(planSeries({ ...MEETING, recurrence: { interval_weeks: 0 }, term: TERM }).error).toMatch(/interval/i);
    expect(planSeries({ ...MEETING, recurrence: { interval_weeks: 99 }, term: TERM }).error).toMatch(/interval/i);
  });

  it('refuses a repeat running longer than a year, whatever end date it was handed', () => {
    const { error } = planSeries({
      ...MEETING, recurrence: { days_of_week: ['Tue'], ends_on: '2028-09-01' }, term: TERM,
    });
    expect(error).toMatch(/year/i);
  });

  it('refuses an event with no times to repeat', () => {
    expect(planSeries({ startTime: null, endTime: null, recurrence: {}, term: TERM }).error).toMatch(/start/i);
    expect(planSeries({ startTime: '2026-09-01 18:00:00', endTime: '2026-09-01 17:00:00', recurrence: {}, term: TERM }).error)
      .toMatch(/after/i);
  });

  /**
   * The create event form posts what a browser date and time field holds, which
   * is YYYY-MM-DDTHH:MM. Read as though it were a stored wall clock reading, the
   * hour was lost and the length came out as no number at all, and the insert
   * failed on it.
   */
  it('plans a repeat from the times a browser date and time field gives it', () => {
    const { series, occurrences } = planSeries({
      startTime: '2026-09-07T18:00',
      endTime: '2026-09-07T19:30',
      recurrence: { days_of_week: ['Mon'], ends_on: '2026-09-21' },
      term: TERM,
    });
    expect(series).toMatchObject({
      days_of_week: 'Mon',
      starts_on: '2026-09-07',
      ends_on: '2026-09-21',
      start_of_day: '18:00:00',
      duration_minutes: 90,
    });
    expect(occurrences.map(o => o.start)).toEqual([
      '2026-09-07 18:00:00', '2026-09-14 18:00:00', '2026-09-21 18:00:00',
    ]);
  });

  it('refuses times it cannot read rather than storing a length that is not a number', () => {
    const { error } = planSeries({
      startTime: 'the seventh at six', endTime: 'half past seven',
      recurrence: { days_of_week: ['Mon'] }, term: TERM,
    });
    expect(error).toMatch(/a date and a time/i);
  });

  it('reads the term from the start date when it is not given one', () => {
    const { series } = planSeries({ ...MEETING, recurrence: { days_of_week: ['Tue'] } });
    expect(series.ends_on > series.starts_on).toBe(true);
  });
});

describe('splitByBusyRoom', () => {
  const occurrences = [
    { date: '2026-09-01', start: '2026-09-01 18:00:00', end: '2026-09-01 19:30:00' },
    { date: '2026-09-08', start: '2026-09-08 18:00:00', end: '2026-09-08 19:30:00' },
    { date: '2026-09-15', start: '2026-09-15 18:00:00', end: '2026-09-15 19:30:00' },
  ];

  it('keeps every occurrence when the room is free', () => {
    const { keep, skipped } = splitByBusyRoom(occurrences, []);
    expect(keep).toHaveLength(3);
    expect(skipped).toEqual([]);
  });

  /**
   * One booked week is not a reason to refuse a term of meetings. The week is
   * left out and reported, so the board can see it and book that one elsewhere.
   */
  it('leaves out a week whose room is already taken, and says which', () => {
    const { keep, skipped } = splitByBusyRoom(occurrences, [
      { start_time: '2026-09-08 19:00:00', end_time: '2026-09-08 21:00:00' },
    ]);
    expect(keep.map(o => o.date)).toEqual(['2026-09-01', '2026-09-15']);
    expect(skipped).toEqual(['2026-09-08']);
  });

  it('counts a booking that only touches the edges as no clash at all', () => {
    const { keep } = splitByBusyRoom(occurrences, [
      { start_time: '2026-09-08 19:30:00', end_time: '2026-09-08 21:00:00' },
      { start_time: '2026-09-01 16:00:00', end_time: '2026-09-01 18:00:00' },
    ]);
    expect(keep).toHaveLength(3);
  });
});
