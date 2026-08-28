import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn().mockResolvedValue([{ affectedRows: 1 }, null]);

vi.mock('mysql2/promise', () => ({
  default: { createPool: vi.fn(() => ({ query: mockQuery })) },
}));

const users = await import('../../db/queries/users.js');

describe('getAllLocalUsers', () => {
  beforeEach(() => mockQuery.mockClear());

  it('joins LocalAccounts and excludes global admins', async () => {
    await users.getAllLocalUsers();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('JOIN LocalAccounts');
    expect(sql).toContain('is_global_admin = FALSE');
    expect(params).toEqual([]);
  });
});

describe('deleteUser', () => {
  beforeEach(() => mockQuery.mockClear());

  it('deletes by net_id', async () => {
    await users.deleteUser('jdoe2');
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM Users WHERE net_id = ?',
      ['jdoe2']
    );
  });
});

describe('updateLocalPassword', () => {
  beforeEach(() => mockQuery.mockClear());

  it('sets the hash for the given net_id, hash first in the parameter list', async () => {
    await users.updateLocalPassword('jdoe2', '$2a$10$abcdefg');
    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE LocalAccounts SET password_hash = ? WHERE net_id = ?',
      ['$2a$10$abcdefg', 'jdoe2']
    );
  });
});

describe('updateUser', () => {
  beforeEach(() => mockQuery.mockClear());

  it('updates only the supplied field', async () => {
    await users.updateUser('jdoe2', { email: 'new@illinois.edu' });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('email = ?');
    expect(sql).not.toContain('full_name = ?');
    expect(params).toEqual(['new@illinois.edu', 'jdoe2']);
  });

  it('updates both fields when both are supplied, net_id last', async () => {
    await users.updateUser('jdoe2', { full_name: 'Jane Doe', email: 'new@illinois.edu' });
    const [, params] = mockQuery.mock.calls[0];
    expect(params).toEqual(['Jane Doe', 'new@illinois.edu', 'jdoe2']);
  });

  it('returns affectedRows 0 without querying when there is nothing to update', async () => {
    const result = await users.updateUser('jdoe2', {});
    expect(result).toEqual({ affectedRows: 0 });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
