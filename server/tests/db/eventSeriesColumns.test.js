import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * An occurrence has to carry its series with it. The scoped edit and delete
 * endpoints read series_id off the event they were handed, and the pages that
 * show an event say what it repeats as, so the two statements that serve them
 * have to bring the rule along.
 */
const poolQuery = vi.hoisted(() => vi.fn(async () => [[], []]));
vi.mock('mysql2/promise', () => ({ default: { createPool: () => ({ query: poolQuery }) } }));

const { getEventById, getEventsByRso } = await import('../../db/queries/events.js');

beforeEach(() => {
  poolQuery.mockClear();
  poolQuery.mockResolvedValue([[], []]);
});

/** The statement the pool was last asked to run, with its whitespace flattened. */
function lastStatement() {
  const [sql] = poolQuery.mock.calls.at(-1);
  return String(sql.sql ?? sql).replace(/\s+/g, ' ').trim();
}

describe.each([
  ['getEventById', () => getEventById(1)],
  ['getEventsByRso', () => getEventsByRso(1)],
])('%s', (_name, run) => {
  it('says which series the event belongs to, if any', async () => {
    await run();
    expect(lastStatement()).toContain('e.series_id');
  });

  it('brings the rule along, so a page can say how the event repeats', async () => {
    await run();
    const sql = lastStatement();
    expect(sql).toContain('LEFT JOIN Event_Series');
    expect(sql).toContain('AS series_interval_weeks');
    expect(sql).toContain('AS series_days_of_week');
    expect(sql).toContain('AS series_ends_on');
  });
});

describe('getEventById', () => {
  it('says whether this occurrence was edited on its own', async () => {
    await getEventById(1);
    expect(lastStatement()).toContain('e.detached');
  });
});
