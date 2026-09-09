import { describe, it, expect } from 'vitest';
import { planSeries } from '../../services/recurringEvents.js';

/**
 * The shapes a repeat can take.
 *
 * A repeat used to be every week or every other week, and nothing else, so a
 * board holding a meeting once a month or on a set of dates that follow no rule
 * had to enter each one by hand. Three shapes now: every so many weeks on the
 * days chosen, once a month on a date or on a weekday of the month, and a set
 * of dates the organizer picked.
 */
const TERM = {
  code: '2026-fa',
  label: 'Fall 2026',
  instructionStart: '2026-08-24',
  instructionEnd: '2026-12-09',
  breaks: [{ name: 'Thanksgiving break', start: '2026-11-25', end: '2026-11-29' }],
};

const MEETING = { startTime: '2026-09-01 18:00:00', endTime: '2026-09-01 19:30:00' };
const plan = recurrence => planSeries({ ...MEETING, recurrence, term: TERM });
const dates = result => result.occurrences.map(o => o.date);

describe('every so many weeks', () => {
  it('takes an interval past the two the form used to offer', () => {
    const result = plan({ frequency: 'weekly', interval_weeks: 3, days_of_week: ['Tue'], ends_on: '2026-11-03' });
    expect(dates(result)).toEqual(['2026-09-01', '2026-09-22', '2026-10-13', '2026-11-03']);
    expect(result.series.interval_weeks).toBe(3);
  });

  it('refuses an interval longer than a repeat could sensibly have', () => {
    expect(plan({ frequency: 'weekly', interval_weeks: 9, days_of_week: ['Tue'] }).error).toMatch(/1 to 8/);
  });
});

describe('once a month, on a date', () => {
  it('produces that date in each month it covers', () => {
    const result = plan({ frequency: 'monthly', month_day: 15, ends_on: '2026-12-09' });
    expect(dates(result)).toEqual(['2026-09-15', '2026-10-15', '2026-11-15']);
  });

  it('describes the rule it was given, ready to store', () => {
    const { series } = plan({ frequency: 'monthly', month_day: 15, ends_on: '2026-12-09' });
    expect(series).toMatchObject({
      frequency: 'monthly',
      interval_months: 1,
      month_day: 15,
      month_week: null,
      days_of_week: null,
      start_of_day: '18:00:00',
      duration_minutes: 90,
    });
  });

  it('skips a month that has no such date rather than sliding into the next one', () => {
    const result = planSeries({
      startTime: '2026-01-31 18:00:00', endTime: '2026-01-31 19:30:00',
      recurrence: { frequency: 'monthly', month_day: 31, ends_on: '2026-04-30' },
      term: TERM,
    });
    expect(dates(result)).toEqual(['2026-01-31', '2026-03-31']);
  });

  it('takes an interval of more than one month', () => {
    const result = plan({ frequency: 'monthly', interval_months: 2, month_day: 15, ends_on: '2027-01-31' });
    expect(dates(result)).toEqual(['2026-09-15', '2026-11-15', '2027-01-15']);
  });

  it('refuses a date no month has', () => {
    expect(plan({ frequency: 'monthly', month_day: 32 }).error).toMatch(/day of the month/i);
  });
});

describe('once a month, on a weekday of the month', () => {
  it('produces the second Tuesday of each month', () => {
    const result = plan({ frequency: 'monthly', month_week: 2, days_of_week: ['Tue'], ends_on: '2026-12-09' });
    expect(dates(result)).toEqual(['2026-09-08', '2026-10-13', '2026-11-10', '2026-12-08']);
  });

  it('produces the last Friday of each month when asked for the last one', () => {
    const result = plan({ frequency: 'monthly', month_week: -1, days_of_week: ['Fri'], ends_on: '2026-10-31' });
    expect(dates(result)).toEqual(['2026-09-25', '2026-10-30']);
  });

  /**
   * A month whose date lands in a week with no classes is stepped over, which
   * is what a weekly rule does with the same week and for the same reason.
   */
  it('steps over a month whose date falls in a week with no classes', () => {
    const result = plan({ frequency: 'monthly', month_week: -1, days_of_week: ['Fri'], ends_on: '2026-12-31' });
    expect(dates(result)).toEqual(['2026-09-25', '2026-10-30', '2026-12-25']);
  });

  it('skips a month whose fifth such weekday does not exist', () => {
    const result = plan({ frequency: 'monthly', month_week: 5, days_of_week: ['Tue'], ends_on: '2026-12-31' });
    expect(dates(result)).toEqual(['2026-09-29', '2026-12-29']);
  });

  it('needs to know which weekday', () => {
    expect(plan({ frequency: 'monthly', month_week: 2 }).error).toMatch(/day of the week/i);
  });

  it('refuses being told both a date and a weekday of the month', () => {
    expect(plan({ frequency: 'monthly', month_day: 15, month_week: 2, days_of_week: ['Tue'] }).error)
      .toMatch(/either a date in the month or a weekday of it/i);
  });

  it('needs to be told one of them', () => {
    expect(plan({ frequency: 'monthly' }).error).toMatch(/either a date in the month or a weekday of it/i);
  });
});

describe('a set of dates the organizer picked', () => {
  it('produces exactly those dates, at the hour the form holds', () => {
    const result = plan({ frequency: 'dates', dates: ['2026-09-03', '2026-09-17', '2026-10-08'] });
    expect(dates(result)).toEqual(['2026-09-03', '2026-09-17', '2026-10-08']);
    expect(result.occurrences[0].start).toBe('2026-09-03 18:00:00');
    expect(result.occurrences[0].end).toBe('2026-09-03 19:30:00');
  });

  it('puts them in order and drops a date given twice', () => {
    const result = plan({ frequency: 'dates', dates: ['2026-10-08', '2026-09-03', '2026-10-08'] });
    expect(dates(result)).toEqual(['2026-09-03', '2026-10-08']);
  });

  /**
   * A date the organizer chose is a date they meant. The break weeks a weekly
   * rule steps over are dates nobody chose, which is a different thing.
   */
  it('keeps a date in a break week, because it was chosen rather than produced', () => {
    const result = plan({ frequency: 'dates', dates: ['2026-11-26'] });
    expect(dates(result)).toEqual(['2026-11-26']);
  });

  it('records the span it covers and the weekdays it falls on', () => {
    const { series } = plan({ frequency: 'dates', dates: ['2026-09-03', '2026-10-08'] });
    expect(series).toMatchObject({
      frequency: 'dates',
      starts_on: '2026-09-03',
      ends_on: '2026-10-08',
      days_of_week: 'Thu',
      interval_weeks: null,
      interval_months: null,
    });
  });

  it('refuses an empty set', () => {
    expect(plan({ frequency: 'dates', dates: [] }).error).toMatch(/at least one date/i);
  });

  it('refuses something that is not a date', () => {
    expect(plan({ frequency: 'dates', dates: ['2026-09-03', 'next tuesday'] }).error).toMatch(/date/i);
  });

  it('refuses more dates than a series may hold', () => {
    const many = Array.from({ length: 201 }, (_, i) => `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`);
    expect(plan({ frequency: 'dates', dates: many }).error).toBeTruthy();
  });
});

describe('the shapes a repeat may not take', () => {
  it('refuses a frequency it does not know', () => {
    expect(plan({ frequency: 'fortnightly', days_of_week: ['Tue'] }).error).toMatch(/weekly, monthly/);
  });

  it('still reads a rule that names no frequency as a weekly one', () => {
    const result = plan({ days_of_week: ['Tue'], ends_on: '2026-09-15' });
    expect(result.series.frequency).toBe('weekly');
    expect(dates(result)).toEqual(['2026-09-01', '2026-09-08', '2026-09-15']);
  });
});
