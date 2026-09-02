import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/queries/locations.js', () => ({
  getByCapacity: vi.fn(),
}));
vi.mock('../../db/queries/events.js', () => ({
  getPublicEvents: vi.fn(),
}));
vi.mock('../../db/queries/midterms.js', () => ({
  getConfirmedMidtermsForScheduler: vi.fn(),
}));
vi.mock('../../db/queries/courses.js', () => ({
  getSectionsForCourses: vi.fn(),
}));
vi.mock('../../db/queries/facilityReservations.js', () => ({
  getReservationsInRange: vi.fn(),
}));

import { recommend } from '../../services/intelligentScheduler.js';
import { getByCapacity } from '../../db/queries/locations.js';
import { getPublicEvents } from '../../db/queries/events.js';
import { getConfirmedMidtermsForScheduler } from '../../db/queries/midterms.js';
import { getSectionsForCourses } from '../../db/queries/courses.js';
import { getReservationsInRange } from '../../db/queries/facilityReservations.js';

const TOMORROW = new Date(Date.now() + 86_400_000);
const IN_3_DAYS = new Date(Date.now() + 3 * 86_400_000);

function ymd(d) {
  // Use local date parts so the string matches new Date(y, m-1, day) in generateSlots
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const BASE_PARAMS = {
  durationMinutes: 60,
  dateRange: { start: ymd(TOMORROW), end: ymd(IN_3_DAYS) },
  timeConstraint: { startHour: 17, endHour: 20, tier: 'strongly_preferred' },
  dayConstraints: [],
  venueConstraints: { buildings: [], specificRoom: null },
  targetCourses: [],
  midtermSensitivity: 'medium',
};

const LOCS = [
  { location_id: 1, building: 'Electrical & Computer Eng Bldg', room_number: '2013', max_capacity: 60, weekly_usage: 5 },
  { location_id: 2, building: 'Coordinated Science Laboratory', room_number: 'B02',  max_capacity: 40, weekly_usage: 3 },
];

beforeEach(() => {
  vi.clearAllMocks();
  getByCapacity.mockResolvedValue(LOCS);
  getPublicEvents.mockResolvedValue([]);
  getConfirmedMidtermsForScheduler.mockResolvedValue([]);
  getSectionsForCourses.mockResolvedValue([]);
  getReservationsInRange.mockResolvedValue([]);
});

describe('recommend() response shape', () => {
  it('returns curatedPicks and allOptions arrays', async () => {
    const result = await recommend(BASE_PARAMS);
    expect(result).toHaveProperty('curatedPicks');
    expect(result).toHaveProperty('allOptions');
    expect(Array.isArray(result.curatedPicks)).toBe(true);
    expect(Array.isArray(result.allOptions)).toBe(true);
  });

  it('each recommendation has start, end, location, score, insights', async () => {
    const result = await recommend(BASE_PARAMS);
    const rec = result.allOptions[0];
    expect(rec).toHaveProperty('start');
    expect(rec).toHaveProperty('end');
    expect(rec).toHaveProperty('location');
    expect(rec).toHaveProperty('score');
    expect(rec).toHaveProperty('insights');
  });

  it('score is between 0 and 100', async () => {
    const result = await recommend(BASE_PARAMS);
    for (const rec of result.allOptions) {
      expect(rec.score).toBeGreaterThanOrEqual(0);
      expect(rec.score).toBeLessThanOrEqual(100);
    }
  });

  it('allOptions capped at 20', async () => {
    const result = await recommend(BASE_PARAMS);
    expect(result.allOptions.length).toBeLessThanOrEqual(20);
  });

  it('curatedPicks capped at 5', async () => {
    const result = await recommend(BASE_PARAMS);
    expect(result.curatedPicks.length).toBeLessThanOrEqual(5);
  });
});

describe('building allowlist', () => {
  it('excludes locations outside ECE-area buildings', async () => {
    getByCapacity.mockResolvedValue([
      ...LOCS,
      { location_id: 3, building: 'Animal Sciences Lab', room_number: '101', max_capacity: 80, weekly_usage: 0 },
    ]);
    const result = await recommend(BASE_PARAMS);
    const buildings = result.allOptions.map(r => r.location.building);
    expect(buildings).not.toContain('Animal Sciences Lab');
  });
});

describe('day-of-week Required constraint', () => {
  it('disqualifies slots not on Required days', async () => {
    const tomorrowDay = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][TOMORROW.getDay()];
    const otherDay = tomorrowDay === 'Mon' ? 'Fri' : 'Mon';
    const result = await recommend({
      ...BASE_PARAMS,
      dateRange: { start: ymd(TOMORROW), end: ymd(TOMORROW) },
      dayConstraints: [{ day: otherDay, tier: 'required' }],
    });
    expect(result.allOptions.length).toBe(0);
  });

  it('accepts slots on Required days', async () => {
    const tomorrowDay = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][TOMORROW.getDay()];
    const result = await recommend({
      ...BASE_PARAMS,
      dateRange: { start: ymd(TOMORROW), end: ymd(TOMORROW) },
      dayConstraints: [{ day: tomorrowDay, tier: 'required' }],
    });
    expect(result.allOptions.length).toBeGreaterThan(0);
  });
});

describe('day-of-week Excluded constraint', () => {
  it('disqualifies slots on excluded days', async () => {
    const tomorrowDay = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][TOMORROW.getDay()];
    const result = await recommend({
      ...BASE_PARAMS,
      dateRange: { start: ymd(TOMORROW), end: ymd(TOMORROW) },
      dayConstraints: [{ day: tomorrowDay, tier: 'excluded' }],
    });
    expect(result.allOptions.length).toBe(0);
  });
});

describe('midterm proximity penalty', () => {
  it('penalizes slots near confirmed target midterms', async () => {
    const slotDate = ymd(TOMORROW);
    const nearMidterm = new Date(TOMORROW);
    nearMidterm.setHours(17 + 12, 0, 0, 0);

    getConfirmedMidtermsForScheduler.mockResolvedValue([{
      midterm_id: 1, course_code: 'ECE 110', title: 'Midterm 1',
      start_time: nearMidterm.toISOString(),
      end_time: new Date(nearMidterm.getTime() + 7_200_000).toISOString(),
    }]);

    const resultWithMidterm = await recommend({
      ...BASE_PARAMS,
      dateRange: { start: slotDate, end: slotDate },
      targetCourses: ['ECE 110'],
    });

    getConfirmedMidtermsForScheduler.mockResolvedValue([]);
    const resultClean = await recommend({
      ...BASE_PARAMS,
      dateRange: { start: slotDate, end: slotDate },
      targetCourses: ['ECE 110'],
    });

    const maxPenalized = Math.max(...(resultWithMidterm.allOptions.map(r => r.score)), 0);
    const maxClean = Math.max(...(resultClean.allOptions.map(r => r.score)), 0);
    expect(maxPenalized).toBeLessThanOrEqual(maxClean);
  });
});

describe('course section overlap penalty', () => {
  it('lecture conflict produces warning insight and large penalty', async () => {
    getSectionsForCourses.mockResolvedValue([{
      section_id: 1, course_code: 'ECE 110', section_type: 'lecture',
      day_of_week: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][TOMORROW.getDay()],
      start_time: '17:00:00', end_time: '18:00:00',
      semester: 'spring 2026', building: 'Electrical & Computer Eng Bldg', room_number: '1002',
    }]);

    const slotDate = ymd(TOMORROW);
    const result = await recommend({
      ...BASE_PARAMS,
      dateRange: { start: slotDate, end: slotDate },
      timeConstraint: { startHour: 17, endHour: 19, tier: 'strongly_preferred' },
      targetCourses: ['ECE 110'],
    });

    const conflictRecs = result.allOptions.filter(r =>
      new Date(r.start).getHours() === 17 &&
      r.insights.some(i => i.type === 'warning' && i.text.includes('Lecture in session'))
    );
    expect(conflictRecs.length).toBeGreaterThan(0);
  });

  it('lab/discussion conflict produces neutral insight and small penalty', async () => {
    getSectionsForCourses.mockResolvedValue([{
      section_id: 2, course_code: 'ECE 385', section_type: 'lab',
      day_of_week: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][TOMORROW.getDay()],
      start_time: '17:00:00', end_time: '18:00:00',
      semester: 'spring 2026', building: 'Electrical & Computer Eng Bldg', room_number: '3017',
    }]);

    const slotDate = ymd(TOMORROW);
    const withLab = await recommend({
      ...BASE_PARAMS,
      dateRange: { start: slotDate, end: slotDate },
      timeConstraint: { startHour: 17, endHour: 19, tier: 'strongly_preferred' },
      targetCourses: ['ECE 385'],
    });

    const labConflicts = withLab.allOptions.filter(r =>
      new Date(r.start).getHours() === 17 &&
      r.insights.some(i => i.type === 'neutral' && i.text.includes('Lab'))
    );
    expect(labConflicts.length).toBeGreaterThan(0);

    getSectionsForCourses.mockResolvedValue([{
      section_id: 1, course_code: 'ECE 385', section_type: 'lecture',
      day_of_week: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][TOMORROW.getDay()],
      start_time: '17:00:00', end_time: '18:00:00',
      semester: 'spring 2026', building: 'Electrical & Computer Eng Bldg', room_number: '1002',
    }]);

    const withLecture = await recommend({
      ...BASE_PARAMS,
      dateRange: { start: slotDate, end: slotDate },
      timeConstraint: { startHour: 17, endHour: 19, tier: 'strongly_preferred' },
      targetCourses: ['ECE 385'],
    });

    const labScore    = Math.max(...labConflicts.map(r => r.score));
    const lectureRecs = withLecture.allOptions.filter(r => new Date(r.start).getHours() === 17);
    const lectureScore = Math.max(...lectureRecs.map(r => r.score), 0);
    expect(labScore).toBeGreaterThan(lectureScore);
  });
});

describe('competing events penalty', () => {
  it('penalizes slots with overlapping platform events', async () => {
    const slotDate = ymd(TOMORROW);
    const eventStart = new Date(TOMORROW);
    eventStart.setHours(18, 0, 0, 0);
    const eventEnd = new Date(eventStart.getTime() + 3_600_000);

    getPublicEvents.mockResolvedValue([{
      event_id: 99, location_id: 99,
      building: 'OTHER', room_number: '100',
      start_time: eventStart.toISOString(),
      end_time: eventEnd.toISOString(),
    }]);

    const result = await recommend({
      ...BASE_PARAMS,
      dateRange: { start: slotDate, end: slotDate },
      timeConstraint: { startHour: 18, endHour: 20, tier: 'nice_to_have' },
    });

    const conflictRecs = result.allOptions.filter(r =>
      new Date(r.start).getHours() === 18 &&
      r.insights.some(i => i.type === 'warning' && i.text.includes('RSO event'))
    );
    expect(conflictRecs.length).toBeGreaterThan(0);
  });
});

describe('curated picks clustering', () => {
  it('returns at most one pick per calendar day', async () => {
    const result = await recommend(BASE_PARAMS);
    const days = result.curatedPicks.map(r => r.start.slice(0, 10));
    const uniqueDays = new Set(days);
    expect(days.length).toBe(uniqueDays.size);
  });
});

describe('allOptions ordering', () => {
  it('is sorted by score descending', async () => {
    const result = await recommend(BASE_PARAMS);
    for (let i = 1; i < result.allOptions.length; i++) {
      expect(result.allOptions[i - 1].score).toBeGreaterThanOrEqual(result.allOptions[i].score);
    }
  });
});

/**
 * The scheduler works in campus wall clock, the same reading everything else in
 * the database is stored in. Slots used to be published with toISOString, which
 * converted them to UTC and so moved every recommendation by whatever offset
 * the container it ran in happened to have.
 */
describe('scheduler times are campus wall clock', () => {
  beforeEach(() => {
    getByCapacity.mockResolvedValue(LOCS);
    getPublicEvents.mockResolvedValue([]);
    getConfirmedMidtermsForScheduler.mockResolvedValue([]);
    getSectionsForCourses.mockResolvedValue([]);
    getReservationsInRange.mockResolvedValue([]);
  });

  it('publishes a slot as a wall clock reading rather than as UTC', async () => {
    const { allOptions } = await recommend(BASE_PARAMS);
    expect(allOptions.length).toBeGreaterThan(0);
    for (const pick of allOptions) {
      expect(pick.start).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(pick.end).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    }
  });

  it('keeps a slot inside the hours it was asked for', async () => {
    const { allOptions } = await recommend(BASE_PARAMS);
    for (const pick of allOptions) {
      const hour = Number(pick.start.slice(11, 13));
      expect(hour).toBeGreaterThanOrEqual(17);
      expect(hour).toBeLessThan(20);
    }
  });

  /**
   * The midterm lookahead reaches past the end of the requested range, and that
   * bound is compared against a stored start_time. Sent as UTC it asked for the
   * wrong window by the length of the container's offset.
   */
  it('asks for midterms up to a wall clock bound', async () => {
    await recommend(BASE_PARAMS);
    const { endDate } = getConfirmedMidtermsForScheduler.mock.calls.at(-1)[0];
    // The end of the last requested day, plus the 72 hour medium window, which
    // lands at the end of the third day after it.
    const expected = new Date(IN_3_DAYS.getFullYear(), IN_3_DAYS.getMonth(), IN_3_DAYS.getDate() + 3);
    expect(endDate).toBe(`${ymd(expected)} 23:59:59`);
  });
});

/**
 * The question a board actually asks is not when is one good evening, it is
 * which evening is good for the rest of the term. A recurring search scores a
 * weekday and an hour across every week it would run, so one bad week lowers a
 * slot rather than hiding it, and the answer says which weeks are clear.
 */
describe('recommend, for an event that repeats', () => {
  // A Tuesday, and the fortnight after it.
  const RANGE = { start: '2026-09-01', end: '2026-09-29' };

  const recurringParams = (overrides = {}) => ({
    ...BASE_PARAMS,
    dateRange: RANGE,
    timeConstraint: { startHour: 18, endHour: 20, tier: 'strongly_preferred' },
    recurrence: { intervalWeeks: 1, daysOfWeek: ['Tue'], until: '2026-09-29' },
    ...overrides,
  });

  it('recommends a weekly slot, and says which weeks it would run', async () => {
    const result = await recommend(recurringParams());
    const [pick] = result.curatedPicks;
    expect(pick.recurrence.occurrences).toEqual([
      '2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29',
    ]);
    expect(pick.recurrence.weeks_total).toBe(5);
    expect(pick.recurrence.weeks_clear).toBe(5);
    expect(pick.start.slice(0, 10)).toBe('2026-09-01');
  });

  it('recommends the same room every week, which is the point of a weekly meeting', async () => {
    const [pick] = (await recommend(recurringParams())).curatedPicks;
    expect(pick.location.location_id).toBeDefined();
    expect(pick.recurrence.conflicts).toEqual([]);
  });

  it('only offers the days the repeat runs on', async () => {
    const result = await recommend(recurringParams({
      recurrence: { intervalWeeks: 1, daysOfWeek: ['Thu'], until: '2026-09-29' },
    }));
    for (const option of result.allOptions) {
      expect(new Date(`${option.start.slice(0, 10)}T12:00:00`).getDay()).toBe(4);
    }
  });

  it('counts the weeks the room is taken against the slot, and names them', async () => {
    getPublicEvents.mockResolvedValue([
      {
        event_id: 1, title: 'Someone else', start_time: '2026-09-08 18:00:00',
        end_time: '2026-09-08 20:00:00',
        building: 'Electrical & Computer Eng Bldg', room_number: '2013',
      },
    ]);
    const result = await recommend(recurringParams());
    const taken = result.allOptions.find(o =>
      o.location.location_id === 1 && o.start === '2026-09-01 18:00:00');
    const free = result.allOptions.find(o =>
      o.location.location_id === 2 && o.start === '2026-09-01 18:00:00');

    expect(taken.recurrence.conflicts).toEqual(['2026-09-08']);
    expect(taken.recurrence.weeks_clear).toBe(4);
    expect(taken.score).toBeLessThan(free.score);
  });

  it('leaves out a room that is taken every single week', async () => {
    getPublicEvents.mockResolvedValue(
      ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29'].map((date, i) => ({
        event_id: i + 1, title: 'Booked solid',
        start_time: `${date} 18:00:00`, end_time: `${date} 20:00:00`,
        building: 'Electrical & Computer Eng Bldg', room_number: '2013',
      }))
    );
    const result = await recommend(recurringParams());
    const stillOffered = result.allOptions.filter(o =>
      o.location.location_id === 1 && o.start === '2026-09-01 18:00:00');
    expect(stillOffered).toEqual([]);
  });

  it('runs every other week when the repeat does', async () => {
    const result = await recommend(recurringParams({
      recurrence: { intervalWeeks: 2, daysOfWeek: ['Tue'], until: '2026-09-29' },
    }));
    expect(result.curatedPicks[0].recurrence.occurrences).toEqual([
      '2026-09-01', '2026-09-15', '2026-09-29',
    ]);
  });

  it('offers one slot per day and hour rather than the same evening many times over', async () => {
    const { curatedPicks } = await recommend(recurringParams());
    const keys = curatedPicks.map(pick => `${pick.start.slice(11, 16)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('says in its insights how much of the term is clear', async () => {
    const [pick] = (await recommend(recurringParams())).curatedPicks;
    expect(pick.insights.some(i => /5 of 5 weeks/.test(i.text))).toBe(true);
  });
});
