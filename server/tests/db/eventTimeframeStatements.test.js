import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The feed splits events at the start of the campus day: what is still to come
 * is upcoming, what is behind us is archived. The database suite would exercise
 * these against real MySQL, but it needs a container. This one runs everywhere
 * and pins the bound itself, both the comparison and the parameter it reads,
 * which is the part a careless edit to one of these six statements would move.
 */
const poolQuery = vi.hoisted(() => vi.fn(async () => [[], []]));
vi.mock('mysql2/promise', () => ({ default: { createPool: () => ({ query: poolQuery }) } }));

const {
  getPublicEvents, getAllEvents, getVisibleEvents,
  countPublicEvents, countAllEvents, countVisibleEvents,
} = await import('../../db/queries/events.js');
const { campusStartOfToday } = await import('../../lib/timezone.js');

const MEMBER_RSOS = [7];

beforeEach(() => {
  poolQuery.mockClear();
  poolQuery.mockResolvedValue([[], []]);
});

/** The statement the pool was last asked to run, with its whitespace flattened. */
function lastStatement() {
  const [sql, params] = poolQuery.mock.calls.at(-1);
  return {
    sql: String(sql.sql ?? sql).replace(/\s+/g, ' ').trim(),
    params: params ?? sql.values ?? [],
  };
}

/**
 * The value a clause's placeholder reads, found by counting the placeholders
 * ahead of it. A bound written into the statement but spliced into the wrong
 * position in the parameter list reads somebody else's value, and only a check
 * that counts them catches it.
 */
function parameterFor(clause) {
  const { sql, params } = lastStatement();
  const at = sql.indexOf(clause);
  expect(at, `expected the statement to contain "${clause}"`).toBeGreaterThan(-1);
  return params[sql.slice(0, at).split('?').length - 1];
}

const listers = [
  ['getPublicEvents',  filters => getPublicEvents(filters)],
  ['getAllEvents',     filters => getAllEvents(filters)],
  ['getVisibleEvents', filters => getVisibleEvents(filters, MEMBER_RSOS)],
];

const counters = [
  ['countPublicEvents',  filters => countPublicEvents(filters)],
  ['countAllEvents',     filters => countAllEvents(filters)],
  ['countVisibleEvents', filters => countVisibleEvents(filters, MEMBER_RSOS)],
];

describe.each([...listers, ...counters])('%s', (_name, run) => {
  it('bounds an upcoming request at the start of the campus day', async () => {
    await run({ timeframe: 'upcoming' });
    expect(parameterFor('AND e.start_time >= ?')).toBe(campusStartOfToday());
  });

  it('bounds an archived request below the start of the campus day', async () => {
    await run({ timeframe: 'archived' });
    expect(parameterFor('AND e.start_time < ?')).toBe(campusStartOfToday());
  });

  it('leaves the whole range open when asked for every event', async () => {
    await run({ timeframe: 'all' });
    const { sql } = lastStatement();
    expect(sql).not.toContain('AND e.start_time >= ?');
    expect(sql).not.toContain('AND e.start_time < ?');
  });

  it('leaves the whole range open when no timeframe is named', async () => {
    await run({});
    const { sql } = lastStatement();
    expect(sql).not.toContain('AND e.start_time >= ?');
    expect(sql).not.toContain('AND e.start_time < ?');
  });

  it('still honours a date range alongside the timeframe', async () => {
    await run({ timeframe: 'upcoming', startDate: '2026-09-10', endDate: '2026-09-20' });
    const { params } = lastStatement();
    expect(params).toContain('2026-09-10');
    expect(params).toContain('2026-09-20');
    expect(parameterFor('AND e.start_time >= ?')).toBe(campusStartOfToday());
  });
});

describe.each(listers)('%s ordering', (_name, run) => {
  it('reads an upcoming feed forwards, nearest event first', async () => {
    await run({ timeframe: 'upcoming' });
    expect(lastStatement().sql).toContain('ORDER BY e.start_time ASC');
  });

  it('reads an archive backwards, most recent event first', async () => {
    await run({ timeframe: 'archived' });
    expect(lastStatement().sql).toContain('ORDER BY e.start_time DESC');
  });
});

describe('a member with no memberships', () => {
  it('carries the timeframe through to the public statement', async () => {
    await getVisibleEvents({ timeframe: 'archived' }, []);
    expect(parameterFor('AND e.start_time < ?')).toBe(campusStartOfToday());
  });

  it('carries the timeframe through to the public count', async () => {
    await countVisibleEvents({ timeframe: 'archived' }, []);
    expect(parameterFor('AND e.start_time < ?')).toBe(campusStartOfToday());
  });
});
