import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const searchLocations = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock('../../db/queries/locations.js', () => ({
  searchLocations, allLocations: vi.fn().mockResolvedValue([]),
  upsertLocation: vi.fn(), getOccupiedDuring: vi.fn(), getByCapacity: vi.fn(),
  clearLocationCache: vi.fn(), getById: vi.fn(),
}));

const app = (await import('../../app.js')).default;

beforeEach(() => searchLocations.mockClear());

/**
 * The venues search box was serving ten results before the paging module
 * existed, and the ceiling was added without changing that default. Both
 * halves of that are worth a test, because a default quietly moving to fifty
 * would change a live search box for every caller.
 */
describe('GET /api/v1/venues/search', () => {
  it('keeps the search box at ten results when no limit is asked for', async () => {
    await request(app).get('/api/v1/venues/search?q=ECEB');
    expect(searchLocations).toHaveBeenCalledWith('ECEB', 10);
  });

  it('clamps a limit above the ceiling rather than refusing it', async () => {
    const res = await request(app).get('/api/v1/venues/search?q=ECEB&limit=999999');
    expect(res.status).toBe(200);
    expect(searchLocations).toHaveBeenCalledWith('ECEB', 100);
  });

  it('refuses a limit that is not a whole number', async () => {
    const res = await request(app).get('/api/v1/venues/search?q=ECEB&limit=abc');
    expect(res.status).toBe(400);
    expect(searchLocations).not.toHaveBeenCalled();
  });
});
