import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A range of dates is a range of days, and a day is a whole day.
 *
 * The calendar asks for a month by its first and its last date, and the week
 * view asks for a week by its Sunday and its Saturday. Compared against a
 * DATETIME column as written, "2026-09-30" is midnight that morning, so an
 * upper bound written as a date excluded everything that happened on the day it
 * named. That is why events went missing from the last week of some months in
 * the calendar while sitting on the events page as usual, and why nothing ever
 * appeared in the Saturday column of the week view.
 *
 * These run without a container, and they pin the bound itself rather than the
 * shape of the statement around it.
 */
const poolQuery = vi.hoisted(() => vi.fn(async () => [[], []]));
vi.mock('mysql2/promise', () => ({ default: { createPool: () => ({ query: poolQuery }) } }));

const {
  getPublicEvents, getAllEvents, getVisibleEvents,
  countPublicEvents, countAllEvents, countVisibleEvents,
} = await import('../../db/queries/events.js');
const { getMidterms, getConfirmedMidtermsForScheduler } = await import('../../db/queries/midterms.js');

const MEMBER_RSOS = [7];

beforeEach(() => {
  poolQuery.mockClear();
  poolQuery.mockResolvedValue([[], []]);
});

/** The parameters the pool was last asked to run a statement with. */
function lastParams() {
  const [sql, params] = poolQuery.mock.calls.at(-1);
  return params ?? sql.values ?? [];
}

const eventQueries = [
  ['getPublicEvents',    filters => getPublicEvents(filters)],
  ['getAllEvents',       filters => getAllEvents(filters)],
  ['getVisibleEvents',   filters => getVisibleEvents(filters, MEMBER_RSOS)],
  ['countPublicEvents',  filters => countPublicEvents(filters)],
  ['countAllEvents',     filters => countAllEvents(filters)],
  ['countVisibleEvents', filters => countVisibleEvents(filters, MEMBER_RSOS)],
];

describe.each(eventQueries)('%s', (_name, run) => {
  it('reaches the end of the last day of the range rather than its first moment', async () => {
    await run({ startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(lastParams()).toContain('2026-09-30 23:59:59');
    expect(lastParams()).not.toContain('2026-09-30');
  });

  it('starts at the first moment of the first day of the range', async () => {
    await run({ startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(lastParams()).toContain('2026-09-01 00:00:00');
  });

  it('leaves a bound that already names a time of day alone', async () => {
    await run({ startDate: '2026-09-01 08:00:00', endDate: '2026-09-30 17:30:00' });
    expect(lastParams()).toContain('2026-09-01 08:00:00');
    expect(lastParams()).toContain('2026-09-30 17:30:00');
  });

  it('leaves an absent bound absent', async () => {
    await run({});
    const params = lastParams();
    expect(params.filter(value => value === null).length).toBeGreaterThan(0);
  });
});

/**
 * The exam schedule reads the same way, and the scheduler weighs a window of
 * exams by the same two dates, so an exam on the last day of the window was
 * being left out of the weighing.
 */
describe('midterm listings', () => {
  it('getMidterms reaches the end of the last day of the range', async () => {
    await getMidterms({ startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(lastParams()).toContain('2026-10-31 23:59:59');
  });

  it('getConfirmedMidtermsForScheduler reaches the end of the last day of the range', async () => {
    await getConfirmedMidtermsForScheduler({ startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(lastParams()).toContain('2026-10-31 23:59:59');
  });
});
