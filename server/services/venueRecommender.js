import { getOccupiedDuring, getByCapacity } from '../db/queries/locations.js';

/**
 * Return a ranked list of available venues for the given constraints.
 * @param {{ attendance: number, startTime: string, endTime: string, requiresAV: boolean }} params
 * @returns {Promise<Array>} Locations sorted by capacity fit (ascending overhead)
 */
export async function recommend({ attendance, startTime, endTime, requiresAV }) {
  const [occupied, candidates] = await Promise.all([
    getOccupiedDuring(startTime, endTime),
    getByCapacity(attendance, requiresAV),
  ]);

  const occupiedIds = new Set(occupied.map(r => r.location_id));

  return candidates
    .filter(loc => !occupiedIds.has(loc.location_id))
    .map(loc => ({
      ...loc,
      capacity_overhead: loc.max_capacity - attendance,
    }))
    .sort((a, b) => a.capacity_overhead - b.capacity_overhead);
}
