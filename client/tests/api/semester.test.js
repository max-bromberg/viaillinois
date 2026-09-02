import { describe, it, expect, vi } from 'vitest';

const apiFetch = vi.hoisted(() => vi.fn().mockResolvedValue({ semester: {} }));
vi.mock('../../src/api/base.js', () => ({ apiFetch }));

const { getCurrentSemester } = await import('../../src/api/semester.js');

describe('getCurrentSemester', () => {
  it('asks the server which term it is', async () => {
    await getCurrentSemester();
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/semester/current');
  });
});
