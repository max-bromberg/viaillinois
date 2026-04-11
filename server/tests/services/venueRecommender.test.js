import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db/queries/locations.js', () => ({
  getOccupiedDuring: vi.fn().mockResolvedValue([{ location_id: 3 }]),
  getByCapacity: vi.fn().mockResolvedValue([
    { location_id: 1, building: 'ECEB', room_number: '1002', max_capacity: 60, has_av_equipment: true,  weekly_usage: 12 },
    { location_id: 2, building: 'ECEB', room_number: '3002', max_capacity: 120, has_av_equipment: true, weekly_usage: 8 },
    { location_id: 3, building: 'DCL',  room_number: '1310', max_capacity: 40, has_av_equipment: false, weekly_usage: 5 },
  ]),
}));

const { recommend } = await import('../../services/venueRecommender.js');

describe('recommend()', () => {
  it('filters out occupied locations', async () => {
    const results = await recommend({ attendance: 30, startTime: 't1', endTime: 't2', requiresAV: false });
    expect(results.find(r => r.location_id === 3)).toBeUndefined();
  });

  it('includes available locations', async () => {
    const results = await recommend({ attendance: 30, startTime: 't1', endTime: 't2', requiresAV: false });
    expect(results.find(r => r.location_id === 1)).toBeDefined();
  });

  it('ranks by capacity fit (closest capacity >= attendance first)', async () => {
    const results = await recommend({ attendance: 30, startTime: 't1', endTime: 't2', requiresAV: false });
    const ids = results.map(r => r.location_id);
    expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(2));
  });

  it('adds capacity_overhead to each result', async () => {
    const results = await recommend({ attendance: 50, startTime: 't1', endTime: 't2', requiresAV: false });
    expect(results[0]).toHaveProperty('capacity_overhead');
  });
});
