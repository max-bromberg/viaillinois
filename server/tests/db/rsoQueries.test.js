import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn().mockResolvedValue([{ insertId: 7, affectedRows: 1 }, null]);

vi.mock('mysql2/promise', () => ({
  default: { createPool: vi.fn(() => ({ query: mockQuery })) },
}));

const rso = await import('../../db/queries/rso.js');

describe('createRso', () => {
  beforeEach(() => mockQuery.mockClear());

  it('inserts all four columns in declared order', async () => {
    await rso.createRso({
      name: 'IEEE UIUC', description: 'Student branch',
      logo_color: '#13294B', founded_year: 1912,
    });
    expect(mockQuery).toHaveBeenCalledWith(
      'INSERT INTO RSOs (name, description, logo_color, founded_year) VALUES (?, ?, ?, ?)',
      ['IEEE UIUC', 'Student branch', '#13294B', 1912]
    );
  });
});

describe('deleteRso', () => {
  beforeEach(() => mockQuery.mockClear());

  it('deletes by primary key and relies on cascading foreign keys', async () => {
    await rso.deleteRso(42);
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM RSOs WHERE rso_id = ?',
      [42]
    );
  });
});
