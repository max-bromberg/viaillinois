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
