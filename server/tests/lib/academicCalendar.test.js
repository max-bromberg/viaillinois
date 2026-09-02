import { describe, it, expect } from 'vitest';
import { termForDate, currentTerm, breakCovering, instructionDays } from '../../lib/academicCalendar.js';

/**
 * A recurring event runs to the end of the term and skips the weeks nobody is
 * on campus, so something has to know when the term ends and when those weeks
 * are. The dates here are derived from the shape of the university calendar,
 * which is close but not authoritative, so every screen shows the date it
 * arrived at and a maintainer can pin a term to the published dates.
 */
describe('termForDate', () => {
  it('reads a date in the autumn as that autumn term', () => {
    const term = termForDate('2026-10-06');
    expect(term.code).toBe('2026-fa');
    expect(term.label).toBe('Fall 2026');
  });

  it('starts the autumn on the fourth Monday of August', () => {
    expect(termForDate('2026-10-06').instructionStart).toBe('2026-08-24');
  });

  it('ends the autumn in the second week of December', () => {
    expect(termForDate('2026-10-06').instructionEnd).toBe('2026-12-09');
  });

  it('reads a date in the spring as that spring term', () => {
    const term = termForDate('2027-02-10');
    expect(term.code).toBe('2027-sp');
    expect(term.label).toBe('Spring 2027');
    expect(term.instructionStart).toBe('2027-01-19');
    expect(term.instructionEnd).toBe('2027-05-05');
  });

  it('reads a summer date as the summer term', () => {
    expect(termForDate('2027-07-01').code).toBe('2027-su');
  });

  /**
   * Between terms there is no current term, and the useful answer is the one
   * about to begin: somebody planning in the winter break is planning spring.
   */
  it('names the next term when the date falls between two of them', () => {
    const term = termForDate('2026-12-20');
    expect(term.code).toBe('2027-sp');
  });

  it('names the term about to begin when the date is before it starts', () => {
    expect(termForDate('2026-08-10').code).toBe('2026-fa');
  });

  it('ends instruction after it starts, in every term it derives', () => {
    for (const date of ['2026-09-02', '2027-02-01', '2027-06-20', '2028-11-11']) {
      const term = termForDate(date);
      expect(term.instructionEnd > term.instructionStart).toBe(true);
    }
  });

  it('takes the published dates for a term a maintainer has pinned', () => {
    const overrides = {
      '2026-fa': {
        instructionStart: '2026-08-25',
        instructionEnd: '2026-12-11',
        breaks: [{ name: 'Reading day', start: '2026-11-01', end: '2026-11-01' }],
      },
    };
    const term = termForDate('2026-10-06', overrides);
    expect(term.instructionStart).toBe('2026-08-25');
    expect(term.instructionEnd).toBe('2026-12-11');
    expect(term.breaks).toEqual([{ name: 'Reading day', start: '2026-11-01', end: '2026-11-01' }]);
  });
});

describe('breaks', () => {
  it('puts the autumn break around Thanksgiving', () => {
    // Thanksgiving 2026 is the fourth Thursday, November 26.
    const term = termForDate('2026-10-06');
    const thanksgiving = term.breaks.find(b => b.name === 'Thanksgiving break');
    expect(thanksgiving).toEqual({ name: 'Thanksgiving break', start: '2026-11-25', end: '2026-11-29' });
  });

  it('puts the spring break in the second half of March', () => {
    const term = termForDate('2027-02-10');
    const spring = term.breaks.find(b => b.name === 'Spring break');
    expect(spring).toEqual({ name: 'Spring break', start: '2027-03-20', end: '2027-03-28' });
  });

  it('gives the summer term no breaks, since it is short enough not to have one', () => {
    expect(termForDate('2027-07-01').breaks).toEqual([]);
  });

  it('says which break a date falls in, and says nothing for a date in none', () => {
    const term = termForDate('2026-10-06');
    expect(breakCovering('2026-11-26', term)?.name).toBe('Thanksgiving break');
    expect(breakCovering('2026-11-25', term)?.name).toBe('Thanksgiving break');
    expect(breakCovering('2026-11-29', term)?.name).toBe('Thanksgiving break');
    expect(breakCovering('2026-11-30', term)).toBeNull();
    expect(breakCovering('2026-10-06', term)).toBeNull();
  });

  it('reports the days of instruction as the term minus its breaks', () => {
    const term = termForDate('2026-10-06');
    const days = instructionDays(term);
    expect(days).toContain('2026-08-24');
    expect(days).toContain('2026-12-09');
    expect(days).not.toContain('2026-11-26');
    expect(days).not.toContain('2026-12-10');
  });
});

describe('currentTerm', () => {
  it('reads the term from a moment on the campus clock', () => {
    expect(currentTerm(new Date('2026-10-06T12:00:00-05:00')).code).toBe('2026-fa');
  });

  it('is the term the platform is in right now, whenever that is', () => {
    const term = currentTerm();
    expect(term.code).toMatch(/^\d{4}-(fa|sp|su)$/);
    expect(term.instructionEnd > term.instructionStart).toBe(true);
  });
});
