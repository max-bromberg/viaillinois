import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The database suite covers deleteMidterm against real MySQL, but that suite
 * needs a container. This one runs everywhere and pins the statement itself,
 * which is the part a schema rename or a Drizzle upgrade would quietly change.
 */
const poolQuery = vi.hoisted(() => vi.fn(async () => [{ affectedRows: 1 }, []]));
vi.mock('mysql2/promise', () => ({ default: { createPool: () => ({ query: poolQuery }) } }));

const { deleteMidterm } = await import('../../db/queries/midterms.js');

beforeEach(() => {
  poolQuery.mockClear();
  poolQuery.mockResolvedValue([{ affectedRows: 1 }, []]);
});

describe('deleteMidterm', () => {
  it('deletes the row the id names, and only that row', async () => {
    await deleteMidterm(42);
    const [sql, params] = poolQuery.mock.calls[0];
    expect(String(sql.sql ?? sql)).toBe('delete from `Midterms` where `Midterms`.`midterm_id` = ?');
    expect(params ?? sql.values).toEqual([42]);
  });

  it('reports how many rows it removed', async () => {
    expect(await deleteMidterm(42)).toEqual({ affectedRows: 1 });
  });

  it('reports nothing removed when the midterm is not there', async () => {
    poolQuery.mockResolvedValue([{ affectedRows: 0 }, []]);
    expect(await deleteMidterm(999)).toEqual({ affectedRows: 0 });
  });
});
