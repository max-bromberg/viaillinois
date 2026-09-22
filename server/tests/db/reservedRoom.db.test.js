import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { migratedDb } from '../support/botTables.js';

let query, end, locations, series, advanced;

// One database for the whole file. The pool is a module singleton, so a suite
// that ended it would leave the next suite in this file with nothing.
beforeAll(async () => {
  ({ query, end } = await migratedDb());
  locations = await import('../../db/queries/locations.js');
  series    = await import('../../db/queries/eventSeries.js');
  advanced  = await import('../../db/queries/advanced.js');
}, 180_000);
afterAll(async () => { await end(); });

/**
 * A room reservation is not the same obstacle as another event.
 *
 * An organization that books its room through the campus reservation system
 * sees that booking arrive on VIA from Ad Astra or from Tableau days or weeks
 * before anybody gets around to entering the event. VIA used to read its own
 * collected copy of that booking as a clash and refuse the organization its own
 * room, which is the case the platform most wants to support. VIA observes the
 * reservation system for ground truth and asserts no booking of its own, so a
 * reservation is reported rather than enforced. Another event on VIA is still
 * refused, because a room given to two events is VIA's own to prevent.
 */
describe('a room that is reserved rather than taken by another event', () => {
  const DAY = '2027-03-01';
  const WINDOW = { start: `${DAY} 18:00:00`, end: `${DAY} 19:30:00` };

  beforeEach(async () => {
    for (const table of ['Events', 'Facility_Reservations', 'Locations', 'RSOs', 'Users']) {
      await query(`DELETE FROM ${table}`);
    }
    await query("INSERT INTO Users (net_id, full_name, email) VALUES ('alice', 'Alice', 'alice@illinois.edu')");
    await query("INSERT INTO RSOs (rso_id, name) VALUES (1, 'IEEE')");
    await query("INSERT INTO Locations (location_id, building, room_number, max_capacity) VALUES (5, 'ECEB', '1002', 40)");
  });

  const reserve = () => query(
    `INSERT INTO Facility_Reservations (location_id, customer, event_name, start_time, end_time, source)
     VALUES (5, 'IEEE', 'Soldering night', ?, ?, 'astra')`,
    [WINDOW.start, WINDOW.end]
  );

  const holdWithAnEvent = () => query(
    `INSERT INTO Events (event_id, rso_id, created_by, location_id, title, start_time, end_time)
     VALUES (10, 1, 'alice', 5, 'Somebody else', ?, ?)`,
    [WINDOW.start, WINDOW.end]
  );

  const newEvent = {
    rso_id: 1, created_by: 'alice', location_id: 5, title: 'Soldering night',
    start_time: WINDOW.start, end_time: WINDOW.end, is_private: 0,
  };

  it('writes the event, and says the room is reserved', async () => {
    await reserve();
    const result = await advanced.createEventTransactional(newEvent, [], true);
    expect(result.conflict).toBeUndefined();
    expect(result.eventId).toBeGreaterThan(0);
    expect(result.reserved).toBe(true);
  });

  it('still refuses the room another event has', async () => {
    await holdWithAnEvent();
    expect(await advanced.createEventTransactional(newEvent, [], true)).toEqual({ conflict: true });
  });

  /** A reservation beside an event is still an event, so the answer is no. */
  it('refuses a room that has both, rather than writing the event', async () => {
    await reserve();
    await holdWithAnEvent();
    expect(await advanced.createEventTransactional(newEvent, [], true)).toEqual({ conflict: true });
  });

  it('says nothing about a reservation when the room is free', async () => {
    const result = await advanced.createEventTransactional(newEvent, [], true);
    expect(result.reserved).toBe(false);
  });

  it('tells the occupancy reading which of the two it found', async () => {
    await reserve();
    const occupied = await locations.getOccupiedDuring(WINDOW.start, WINDOW.end);
    expect(occupied).toEqual([{ location_id: 5, source: 'reservation' }]);

    await holdWithAnEvent();
    const both = await locations.getOccupiedDuring(WINDOW.start, WINDOW.end);
    expect(both.map(row => row.source).sort()).toEqual(['event', 'reservation']);
  });

  it('tells the repeat reading which of the two it found', async () => {
    await reserve();
    await holdWithAnEvent();
    const busy = await series.busyInRoom(5, `${DAY} 00:00:00`, '2027-03-02 00:00:00');
    expect(busy.map(row => row.source).sort()).toEqual(['event', 'reservation']);
    expect(busy.every(row => row.start_time && row.end_time)).toBe(true);
  });
});
