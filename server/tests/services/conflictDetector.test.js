import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db/queries/locations.js', () => ({
  getOccupiedDuring: vi.fn(),
}));
vi.mock('../../db/queries/internalReads.ts', () => ({
  getSectionsOccupying: vi.fn(),
}));

const { checkConflict, occupiedLocationIds } = await import('../../services/conflictDetector.js');
const { getOccupiedDuring } = await import('../../db/queries/locations.js');
const { getSectionsOccupying } = await import('../../db/queries/internalReads.ts');

describe('checkConflict()', () => {
  it('returns false when location is not occupied', async () => {
    getOccupiedDuring.mockResolvedValueOnce([{ location_id: 2 }, { location_id: 3 }]);
    const result = await checkConflict(1, '2026-04-01 18:00:00', '2026-04-01 20:00:00');
    expect(result).toBe(false);
  });

  it('returns true when location_id is in occupied list', async () => {
    getOccupiedDuring.mockResolvedValueOnce([{ location_id: 1 }, { location_id: 5 }]);
    const result = await checkConflict(1, '2026-04-01 18:00:00', '2026-04-01 20:00:00');
    expect(result).toBe(true);
  });

  it('passes excludeEventId to getOccupiedDuring', async () => {
    getOccupiedDuring.mockResolvedValueOnce([{ location_id: 1 }]);
    const result = await checkConflict(1, '2026-04-01 18:00:00', '2026-04-01 20:00:00', 42);
    expect(result).toBe(true);
    expect(getOccupiedDuring).toHaveBeenCalledWith(
      '2026-04-01 18:00:00', '2026-04-01 20:00:00', 42
    );
  });
});

/**
 * Whether a room is free for a window is a wider question than whether an
 * event can be booked into it. checkConflict weighs the two things VIA
 * schedules against, its own events and the facility reservations it collects,
 * because those are the two a board can do something about. A person asking
 * which rooms are free at six also has to be told about the class that meets
 * there, so this second reading adds the timetable.
 */
describe('occupiedLocationIds()', () => {
  it('unions the events, the reservations and the classes that meet', async () => {
    getOccupiedDuring.mockResolvedValueOnce([{ location_id: 2 }, { location_id: 3 }]);
    getSectionsOccupying.mockResolvedValueOnce([3, 9]);
    const occupied = await occupiedLocationIds('2026-04-01 18:00:00', '2026-04-01 20:00:00');
    expect(occupied).toBeInstanceOf(Set);
    expect([...occupied].sort((a, b) => a - b)).toEqual([2, 3, 9]);
  });

  it('asks both readings about the same window', async () => {
    getOccupiedDuring.mockResolvedValueOnce([]);
    getSectionsOccupying.mockResolvedValueOnce([]);
    await occupiedLocationIds('2026-04-01 18:00:00', '2026-04-01 20:00:00');
    expect(getOccupiedDuring).toHaveBeenCalledWith('2026-04-01 18:00:00', '2026-04-01 20:00:00');
    expect(getSectionsOccupying).toHaveBeenCalledWith('2026-04-01 18:00:00', '2026-04-01 20:00:00');
  });

  it('is empty when nothing has the building at all', async () => {
    getOccupiedDuring.mockResolvedValueOnce([]);
    getSectionsOccupying.mockResolvedValueOnce([]);
    expect((await occupiedLocationIds('2026-04-01 18:00:00', '2026-04-01 20:00:00')).size).toBe(0);
  });
});
