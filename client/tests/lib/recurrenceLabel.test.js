import { describe, it, expect } from 'vitest';
import { recurrenceLabel, repeatSummary } from '../../src/lib/recurrenceLabel.js';

const weekly = {
  series_id: 3,
  series_frequency: 'weekly',
  series_interval_weeks: 1,
  series_days_of_week: 'Tue',
  series_ends_on: '2026-12-08',
};

/**
 * A page saying an event repeats has to say what that means in the words a
 * person would use, and the end date it names is a day the event runs on.
 */
describe('recurrenceLabel', () => {
  it('says which day it repeats on and when it stops', () => {
    expect(recurrenceLabel(weekly)).toBe('Repeats every Tuesday until December 8');
  });

  it('says every other week when that is the interval', () => {
    expect(recurrenceLabel({ ...weekly, series_interval_weeks: 2 }))
      .toBe('Repeats every other Tuesday until December 8');
  });

  it('reads a longer interval as a number of weeks', () => {
    expect(recurrenceLabel({ ...weekly, series_interval_weeks: 3 }))
      .toBe('Repeats every 3 weeks on Tuesday until December 8');
  });

  it('lists several days the way a person would say them', () => {
    expect(recurrenceLabel({ ...weekly, series_days_of_week: 'Tue,Thu' }))
      .toBe('Repeats every Tuesday and Thursday until December 8');
    expect(recurrenceLabel({ ...weekly, series_days_of_week: 'Mon,Wed,Fri' }))
      .toBe('Repeats every Monday, Wednesday and Friday until December 8');
  });

  /**
   * The end date is stored as a day, not as an instant, so it is read as the
   * day it is rather than through a timezone that would move it to the one
   * before for every reader west of UTC.
   */
  it('names the day the series ends on, not the day before it', () => {
    expect(recurrenceLabel({ ...weekly, series_ends_on: '2026-01-01' })).toMatch(/January 1$/);
  });

  it('says nothing for an event that does not repeat', () => {
    expect(recurrenceLabel({ event_id: 1 })).toBe('');
    expect(recurrenceLabel(null)).toBe('');
  });
});

/**
 * The same sentence, for a repeat that has been described on a form but not
 * created yet, where there is no series to read it off.
 */
describe('repeatSummary', () => {
  it('describes what the form would create', () => {
    expect(repeatSummary({ interval_weeks: 1, days_of_week: ['Tue'], ends_on: '2026-12-08' }))
      .toBe('Repeats every Tuesday until December 8');
  });

  it('says nothing when the form is not asking for a repeat', () => {
    expect(repeatSummary(null)).toBe('');
    expect(repeatSummary({ interval_weeks: 1, days_of_week: [], ends_on: '2026-12-08' })).toBe('');
  });
});

/**
 * The two shapes that are not weekly.
 *
 * A repeat used to be every week or every other week, so the sentence only had
 * to describe one shape. It now has to say what a monthly rule means, in both
 * of the forms a monthly rule can take, and what a set of picked dates is.
 */
describe('recurrenceLabel for a monthly repeat', () => {
  const monthly = {
    series_id: 4,
    series_frequency: 'monthly',
    series_interval_months: 1,
    series_ends_on: '2026-12-15',
  };

  it('says which date of the month it falls on', () => {
    expect(recurrenceLabel({ ...monthly, series_month_day: 15 }))
      .toBe('Repeats on the 15th of each month until December 15');
  });

  it('reads the ordinal of a date that is not a plain number', () => {
    expect(recurrenceLabel({ ...monthly, series_month_day: 1 })).toMatch(/the 1st of each month/);
    expect(recurrenceLabel({ ...monthly, series_month_day: 2 })).toMatch(/the 2nd of each month/);
    expect(recurrenceLabel({ ...monthly, series_month_day: 3 })).toMatch(/the 3rd of each month/);
    expect(recurrenceLabel({ ...monthly, series_month_day: 22 })).toMatch(/the 22nd of each month/);
  });

  it('says which weekday of the month it falls on', () => {
    expect(recurrenceLabel({ ...monthly, series_month_week: 2, series_days_of_week: 'Tue' }))
      .toBe('Repeats on the second Tuesday of each month until December 15');
  });

  it('says the last one when that is the position', () => {
    expect(recurrenceLabel({ ...monthly, series_month_week: -1, series_days_of_week: 'Fri' }))
      .toBe('Repeats on the last Friday of each month until December 15');
  });

  it('says how many months apart when it is more than one', () => {
    expect(recurrenceLabel({ ...monthly, series_month_day: 15, series_interval_months: 3 }))
      .toBe('Repeats on the 15th of every 3 months until December 15');
  });
});

describe('recurrenceLabel for a set of picked dates', () => {
  it('says it runs on the dates the organizer chose', () => {
    expect(recurrenceLabel({
      series_id: 5, series_frequency: 'dates',
      series_days_of_week: 'Thu,Sat', series_ends_on: '2026-10-08',
    })).toBe('Repeats on dates chosen one by one, the last on October 8');
  });
});

describe('repeatSummary, for a form that has no series yet', () => {
  it('describes a monthly repeat on a date', () => {
    expect(repeatSummary({ frequency: 'monthly', interval_months: 1, month_day: 15, ends_on: '2026-12-15' }))
      .toBe('Repeats on the 15th of each month until December 15');
  });

  it('describes a monthly repeat on a weekday of the month', () => {
    expect(repeatSummary({ frequency: 'monthly', interval_months: 1, month_week: 2, days_of_week: ['Tue'] }))
      .toBe('Repeats on the second Tuesday of each month');
  });

  it('counts the dates a repeat holds when they were picked one by one', () => {
    expect(repeatSummary({ frequency: 'dates', dates: ['2026-09-03', '2026-10-08'] }))
      .toBe('Repeats on 2 dates chosen one by one, the last on October 8');
  });

  it('says nothing about a set of dates that is still empty', () => {
    expect(repeatSummary({ frequency: 'dates', dates: [] })).toBe('');
  });
});
