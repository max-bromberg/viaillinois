import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn().mockResolvedValue([[{ id: 1 }], null]);

vi.mock('mysql2/promise', () => ({
  default: {
    createPool: vi.fn(() => ({ query: mockQuery })),
  },
}));

// Dynamic import after mock is set up
const { query } = await import('../../db/pool.js');

describe('query()', () => {
  beforeEach(() => mockQuery.mockClear());

  it('returns the rows array from pool.query', async () => {
    const rows = await query('SELECT 1');
    expect(rows).toEqual([{ id: 1 }]);
  });

  it('forwards sql and params to pool.query', async () => {
    await query('SELECT * FROM Users WHERE net_id = ?', ['mbrom3']);
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM Users WHERE net_id = ?',
      ['mbrom3']
    );
  });

  it('defaults params to empty array', async () => {
    await query('SELECT 1');
    expect(mockQuery).toHaveBeenCalledWith('SELECT 1', []);
  });

  it('rejects when pool.query rejects', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB_DOWN'));
    await expect(query('SELECT 1')).rejects.toThrow('DB_DOWN');
  });
});
