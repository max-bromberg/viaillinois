import { describe, it, expect, vi } from 'vitest';

const mockQuery = vi.fn().mockResolvedValue([[{ one: 1 }], null]);
const createPool = vi.fn(() => ({ query: mockQuery }));

vi.mock('mysql2/promise', () => ({ default: { createPool } }));

describe('drizzle client', () => {
  it('is constructed over the single shared mysql2 pool', async () => {
    const pool = (await import('../../db/pool.js')).default;
    const db = (await import('../../db/client.ts')).default;
    expect(db).toBeDefined();
    expect(createPool).toHaveBeenCalledTimes(1);
    expect(db.session).toBeDefined();
    expect(pool).toBeDefined();
  });
});
