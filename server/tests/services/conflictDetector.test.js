import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db/queries/locations.js', () => ({
  getOccupiedDuring: vi.fn(),
}));
vi.mock('../../db/queries/internalReads.ts', () => ({
  getSectionsOccupying: vi.fn(),
}));

const { occupancyInRoom, occupiedLocationIds } = await import('../../services/conflictDetector.js');
const { getOccupiedDuring } = await import('../../db/queries/locations.js');
const { getSectionsOccupying } = await import('../../db/queries/internalReads.ts');

/**
 * What has the room during a window, told apart by where it came from.
 *
 * Another event on VIA and a reservation collected from Ad Astra or from
 * Tableau are both occupancy, and they are answered differently. A second event
 * in one room is something VIA created and can refuse. A reservation is very
 * often the organization's own booking, which reaches VIA from the facilities
 * sources before anybody enters the event, so refusing it turned an
 * organization away from the room it had actually booked.
 */
describe('occupancyInRoom()', () => {
  const WINDOW = ['2026-04-01 18:00:00', '2026-04-01 20:00:00'];

  it('finds nothing when the room is free', async () => {
    getOccupiedDuring.mockResolvedValueOnce([
      { location_id: 2, source: 'event' }, { location_id: 3, source: 'reservation' },
    ]);
    expect(await occupancyInRoom(1, ...WINDOW)).toEqual({ event: false, reservation: false });
  });

  it('reports another event in the room', async () => {
    getOccupiedDuring.mockResolvedValueOnce([{ location_id: 1, source: 'event' }]);
    expect(await occupancyInRoom(1, ...WINDOW)).toEqual({ event: true, reservation: false });
  });

  it('reports a reservation as a reservation rather than as an event', async () => {
    getOccupiedDuring.mockResolvedValueOnce([{ location_id: 1, source: 'reservation' }]);
    expect(await occupancyInRoom(1, ...WINDOW)).toEqual({ event: false, reservation: true });
  });

  it('reports both when the room has both', async () => {
    getOccupiedDuring.mockResolvedValueOnce([
      { location_id: 1, source: 'reservation' }, { location_id: 1, source: 'event' },
    ]);
    expect(await occupancyInRoom(1, ...WINDOW)).toEqual({ event: true, reservation: true });
  });

  /** A row that does not say where it came from is an event, which is refused. */
  it('treats a row naming no source as an event', async () => {
    getOccupiedDuring.mockResolvedValueOnce([{ location_id: 1 }]);
    expect(await occupancyInRoom(1, ...WINDOW)).toEqual({ event: true, reservation: false });
  });

  it('leaves the event being edited out of the reading', async () => {
    getOccupiedDuring.mockResolvedValueOnce([]);
    await occupancyInRoom(1, ...WINDOW, 42);
    expect(getOccupiedDuring).toHaveBeenCalledWith(...WINDOW, 42);
  });
});

/**
 * Whether a room is free for a window is a wider question than whether an
 * event can be booked into it. occupancyInRoom weighs the two things VIA
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
