import { campusStartOfToday } from './timezone.js';

/**
 * The university calendar, as much of it as VIA needs.
 *
 * A recurring event runs to the end of instruction and skips the weeks when
 * nobody is on campus, so something has to know when a term begins, when it
 * ends and where its breaks are.
 *
 * The dates below are derived from the shape the calendar has every year: the
 * autumn starts on the fourth Monday of August, the spring on the day after
 * the third Monday of January, and the breaks sit where the holidays they are
 * built around sit. That is close to the published calendar and is not the
 * published calendar, so two things follow. A maintainer can pin any term to
 * its official dates in TERM_DATES below, which is one line a year. And every
 * screen that uses a derived date shows it, so an organizer setting up a
 * weekly meeting sees the last date it will run and can move it.
 */

/**
 * Terms pinned to their published dates. Anything not listed here is derived.
 * Add a term the year it is published:
 *
 *   '2026-fa': {
 *     instructionStart: '2026-08-24',
 *     instructionEnd:   '2026-12-09',
 *     breaks: [{ name: 'Thanksgiving break', start: '2026-11-21', end: '2026-11-29' }],
 *   },
 */
const TERM_DATES = {};

const SEASONS = {
  sp: { label: 'Spring' },
  su: { label: 'Summer' },
  fa: { label: 'Fall' },
};

const MS_PER_DAY = 86_400_000;

const pad = n => String(n).padStart(2, '0');

/** A date string as the UTC instant of its midnight, for calendar arithmetic. */
function asUtc(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function asDate(instant) {
  const d = new Date(instant);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** The date a whole number of days from another. */
export function addDays(date, days) {
  return asDate(asUtc(date) + days * MS_PER_DAY);
}

/** Day of the week of a date, as 0 for Sunday through 6 for Saturday. */
export function weekdayOf(date) {
  return new Date(asUtc(date)).getUTCDay();
}

/** The nth occurrence of a weekday in a month, as a date. */
function nthWeekday(year, month, weekday, n) {
  const first = Date.UTC(year, month - 1, 1);
  const shift = (weekday - new Date(first).getUTCDay() + 7) % 7;
  return asDate(first + (shift + (n - 1) * 7) * MS_PER_DAY);
}

/**
 * The term of a given season in a given year, derived.
 *
 * The autumn and the spring carry one break each, the two the university
 * closes for. The summer is eight weeks and has none.
 */
function deriveTerm(year, season) {
  if (season === 'fa') {
    const thanksgiving = nthWeekday(year, 11, 4, 4);
    return {
      instructionStart: nthWeekday(year, 8, 1, 4),
      instructionEnd:   nthWeekday(year, 12, 3, 2),
      breaks: [{
        name: 'Thanksgiving break',
        start: addDays(thanksgiving, -1),
        end:   addDays(thanksgiving, 3),
      }],
    };
  }

  if (season === 'sp') {
    // Instruction begins the day after the holiday on the third Monday.
    const springBreakStart = addDays(nthWeekday(year, 3, 5, 3), 1);
    return {
      instructionStart: addDays(nthWeekday(year, 1, 1, 3), 1),
      instructionEnd:   nthWeekday(year, 5, 3, 1),
      breaks: [{ name: 'Spring break', start: springBreakStart, end: addDays(springBreakStart, 8) }],
    };
  }

  return {
    instructionStart: nthWeekday(year, 6, 1, 2),
    instructionEnd:   nthWeekday(year, 8, 5, 1),
    breaks: [],
  };
}

function buildTerm(year, season, overrides) {
  const code = `${year}-${season}`;
  return {
    code,
    label: `${SEASONS[season].label} ${year}`,
    ...deriveTerm(year, season),
    ...(overrides[code] ?? {}),
  };
}

/** Every term that could contain or follow a date, in the order they run. */
function termsAround(year, overrides) {
  return [
    buildTerm(year, 'sp', overrides),
    buildTerm(year, 'su', overrides),
    buildTerm(year, 'fa', overrides),
    buildTerm(year + 1, 'sp', overrides),
  ];
}

/**
 * The term a date belongs to.
 *
 * A date inside a term's instruction is in that term. A date between terms,
 * such as one in the winter break, belongs to the term about to begin, because
 * somebody planning then is planning for that term.
 *
 * @param {string} date YYYY-MM-DD
 * @param {object} [overrides] terms pinned to published dates, for testing
 * @returns {{ code: string, label: string, instructionStart: string, instructionEnd: string,
 *             breaks: Array<{ name: string, start: string, end: string }> }}
 */
export function termForDate(date, overrides = TERM_DATES) {
  const year = Number(date.slice(0, 4));
  const terms = termsAround(year, overrides);
  const covering = terms.find(term => date >= term.instructionStart && date <= term.instructionEnd);
  if (covering) return covering;
  return terms.find(term => term.instructionStart > date) ?? terms[terms.length - 1];
}

/**
 * The term the platform is in now, read on the campus clock.
 *
 * @param {Date} [instant]
 * @param {object} [overrides]
 */
export function currentTerm(instant = new Date(), overrides = TERM_DATES) {
  return termForDate(campusStartOfToday(instant).slice(0, 10), overrides);
}

/**
 * The break a date falls inside, or null when it falls in none.
 *
 * @param {string} date YYYY-MM-DD
 * @param {{ breaks: Array<{ name: string, start: string, end: string }> }} term
 */
export function breakCovering(date, term) {
  return term.breaks.find(range => date >= range.start && date <= range.end) ?? null;
}

/**
 * Every date a term holds instruction on, breaks left out.
 *
 * @param {object} term
 * @returns {string[]} YYYY-MM-DD
 */
export function instructionDays(term) {
  const days = [];
  for (let date = term.instructionStart; date <= term.instructionEnd; date = addDays(date, 1)) {
    if (!breakCovering(date, term)) days.push(date);
  }
  return days;
}
