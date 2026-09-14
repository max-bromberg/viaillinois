import { describe, it, expect } from 'vitest';
import { greetingCounts, firstName } from '../../src/lib/greeting.js';

/**
 * The greeting knows what time it is and what is on. It never invents a number:
 * a count the page has not been given is left out rather than shown as a zero,
 * because "0 tonight in ECEB" reads as a broken page rather than as a quiet
 * Tuesday.
 */
const NOW = '2026-09-10T18:00:00-05:00';

const at = (day, hour, building = 'ECEB') => ({
  start_time: `2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00-05:00`,
  building,
});

// Which sky is over the building is decided in campusTime.js, so that the band,
// the greeting and the agenda read one clock. See tests/lib/campusSky.test.js.

describe('the name in the greeting', () => {
  it('is the first name, because that is how a friend greets you', () => {
    expect(firstName({ full_name: 'Max Bromberg' })).toBe('Max');
  });

  it('is nothing when there is nobody, or nobody with a name', () => {
    expect(firstName(null)).toBe(null);
    expect(firstName({ full_name: '' })).toBe(null);
    expect(firstName({ net_id: 'jdoe2' })).toBe(null);
  });

  /**
   * Azure AD hands back a display name in the directory's own order, which for
   * this campus is the family name, a comma, then the given name. Read as
   * whitespace separated words, the first of those is "Bromberg," and the
   * greeting drew "Good evening, Bromberg,." on the front page of the live
   * site. The comma is the whole signal that the order is reversed.
   */
  it('reads the given name when the directory writes the family name first', () => {
    expect(firstName({ full_name: 'Bromberg, Maxwell' })).toBe('Maxwell');
    expect(firstName({ full_name: 'Bromberg,Maxwell' })).toBe('Maxwell');
    expect(firstName({ full_name: 'Van Der Berg, Anna Marie' })).toBe('Anna');
  });

  it('keeps the plain order working, and never answers with a comma', () => {
    expect(firstName({ full_name: '  Max   Bromberg  ' })).toBe('Max');
    expect(firstName({ full_name: 'Cher' })).toBe('Cher');
    // A trailing comma with nothing after it is a family name on its own, which
    // is still better than greeting somebody with punctuation.
    expect(firstName({ full_name: 'Bromberg,' })).toBe('Bromberg');
    expect(firstName({ full_name: ', Maxwell' })).toBe('Maxwell');
  });
});

describe('the counts', () => {
  it('counts tonight in the building it names', () => {
    const { tonight } = greetingCounts({
      events: [at(10, 18), at(10, 19), at(10, 20, 'Siebel'), at(11, 18)],
      now: NOW,
    });
    expect(tonight).toBe(2);
  });

  it('counts the week from today, seven days out', () => {
    const { week } = greetingCounts({
      events: [at(10, 18), at(12, 18), at(16, 18), at(18, 18)],
      now: NOW,
    });
    expect(week).toBe(3);
  });

  it('says how far the next midterm is, and which course it is for', () => {
    const { midterm } = greetingCounts({
      events: [at(10, 18)],
      midterms: [
        { start_time: '2026-09-25T19:00:00-05:00', course_code: 'ECE 385' },
        { start_time: '2026-09-19T19:00:00-05:00', course_code: 'ECE 210' },
      ],
      now: NOW,
    });
    expect(midterm).toEqual({ days: 9, course: 'ECE 210' });
  });

  it('leaves a midterm that has already been sat out of it', () => {
    const { midterm } = greetingCounts({
      events: [at(10, 18)],
      midterms: [{ start_time: '2026-09-01T19:00:00-05:00', course_code: 'ECE 210' }],
      now: NOW,
    });
    expect(midterm).toBe(null);
  });

  it('leaves out every count it has not been given, rather than showing zeroes', () => {
    expect(greetingCounts({ now: NOW })).toEqual({ tonight: null, week: null, midterm: null });
  });

  it('says nothing is on tonight rather than nothing at all, once it knows the day', () => {
    // There are events today, none of them in the building, so the count is a
    // real zero and is worth saying.
    const { tonight } = greetingCounts({ events: [at(10, 18, 'Siebel')], now: NOW });
    expect(tonight).toBe(0);
  });
});
