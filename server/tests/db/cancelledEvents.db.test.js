import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { migratedDb } from '../support/botTables.js';
import { campusStartOfToday } from '../../lib/timezone.js';

let query, end, events, locations, series, advanced, interest;

// One database for the whole file. The pool is a module singleton, so a
// suite that ended it would leave the next suite in this file with nothing.
beforeAll(async () => {
  ({ query, end } = await migratedDb());
  events    = await import('../../db/queries/events.js');
  locations = await import('../../db/queries/locations.js');
  series    = await import('../../db/queries/eventSeries.js');
  advanced  = await import('../../db/queries/advanced.js');
  interest  = await import('../../db/queries/eventInterest.ts');
}, 180_000);
afterAll(async () => { await end(); });

const TODAY = campusStartOfToday().slice(0, 10);
function campusDay(offset) {
  const [year, month, day] = TODAY.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}
const NEXT_WEEK = campusDay(7);
const LAST_WEEK = campusDay(-7);

/**
 * A cancelled event keeps its row and its date. What changes is where it
 * shows: out of everything that says "coming up", into the archive marked,
 * and out of the way of anyone who wants its room.
 */
describe('cancelled events', () => {
  beforeEach(async () => {
    for (const table of ['Event_Interest', 'Events', 'Locations', 'RSOs', 'Users']) {
      await query(`DELETE FROM ${table}`);
    }
    await query("INSERT INTO Users (net_id, full_name, email) VALUES ('alice', 'Alice', 'alice@illinois.edu')");
    await query("INSERT INTO RSOs (rso_id, name) VALUES (1, 'IEEE')");
    await query("INSERT INTO Locations (location_id, building, room_number, max_capacity) VALUES (5, 'ECEB', '1002', 40)");
    await query(
      `INSERT INTO Events (event_id, rso_id, created_by, location_id, title, start_time, end_time, cancelled_at) VALUES
        (10, 1, 'alice', 5, 'Still on',       '${NEXT_WEEK} 18:00:00', '${NEXT_WEEK} 19:00:00', NULL),
        (11, 1, 'alice', 5, 'Called off',     '${NEXT_WEEK} 20:00:00', '${NEXT_WEEK} 21:00:00', '${TODAY} 09:00:00'),
        (12, 1, 'alice', 5, 'Already happened', '${LAST_WEEK} 18:00:00', '${LAST_WEEK} 19:00:00', NULL)`
    );
  });

  it('is not upcoming, whatever its date says', async () => {
    const titles = (await events.getPublicEvents({ timeframe: 'upcoming' })).map(e => e.title);
    expect(titles).toEqual(['Still on']);
    expect((await events.countPublicEvents({ timeframe: 'upcoming' }))[0].total).toBe(1);
  });

  it('is in the archive, marked, beside what has already happened', async () => {
    const rows = await events.getPublicEvents({ timeframe: 'archived' });
    expect(rows.map(e => e.title)).toEqual(['Called off', 'Already happened']);
    expect(rows[0].cancelled_at).toBe(`${TODAY} 09:00:00`);
    expect(rows[1].cancelled_at).toBeNull();
  });

  it('is still there when every event is asked for', async () => {
    expect((await events.getAllEvents({ timeframe: 'all' }))).toHaveLength(3);
  });

  it('is left off the lobby display', async () => {
    const titles = (await events.getKioskEvents(10)).map(e => e.title);
    expect(titles).toEqual(['Still on']);
  });

  it('is shown to its board with the mark, so the dashboard can say so', async () => {
    const rows = await events.getEventsByRso(1);
    expect(rows.find(e => e.event_id === 11).cancelled_at).toBe(`${TODAY} 09:00:00`);
    expect(rows.find(e => e.event_id === 10).cancelled_at).toBeNull();
  });

  it('gives its room back', async () => {
    const during = [`${NEXT_WEEK} 20:15:00`, `${NEXT_WEEK} 20:45:00`];
    const occupied = await locations.getOccupiedDuring(during[0], during[1]);
    expect(occupied.map(r => r.location_id)).not.toContain(5);
    expect(await series.busyInRoom(5, during[0], during[1])).toEqual([]);
    const created = await advanced.createEventTransactional(
      { rso_id: 1, created_by: 'alice', location_id: 5, title: 'Takes the room', description: null,
        start_time: during[0], end_time: during[1], is_private: false }, [], true);
    expect(created.conflict).toBeUndefined();
    expect(created.eventId).toEqual(expect.any(Number));
  });

  it('still holds its room while it is on', async () => {
    const during = [`${NEXT_WEEK} 18:15:00`, `${NEXT_WEEK} 18:45:00`];
    const occupied = await locations.getOccupiedDuring(during[0], during[1]);
    expect(occupied.map(r => r.location_id)).toContain(5);
  });
});

describe('the event page', () => {
  beforeEach(async () => {
    for (const table of ['Event_Interest', 'Events', 'RSOs', 'Users']) {
      await query(`DELETE FROM ${table}`);
    }
    await query("INSERT INTO Users (net_id, full_name, email) VALUES ('alice', 'Alice', 'alice@illinois.edu')");
    await query("INSERT INTO RSOs (rso_id, name) VALUES (1, 'IEEE')");
    await query(
      `INSERT INTO Events (event_id, rso_id, created_by, title, start_time, end_time, location_note) VALUES
        (10, 1, 'alice', 'Still on',   '${NEXT_WEEK} 18:00:00', '${NEXT_WEEK} 19:00:00', 'Use the north entrance.'),
        (11, 1, 'alice', 'Later',      '${NEXT_WEEK} 20:00:00', '${NEXT_WEEK} 21:00:00', NULL),
        (12, 1, 'alice', 'Past',       '${LAST_WEEK} 18:00:00', '${LAST_WEEK} 19:00:00', NULL)`
    );
    await query("INSERT INTO Event_Interest (event_id, subject, source) VALUES (10, 'alice', 'web'), (10, 'h:abc', 'discord_event'), (12, 'alice', 'web')");
  });

  it('carries the cancellation, the location note and how many people are interested', async () => {
    const event = await events.getEventById(10);
    expect(event.cancelled_at).toBeNull();
    expect(event.location_note).toBe('Use the north entrance.');
    expect(event.interest_count).toBe(2);
    expect((await events.getEventById(11)).interest_count).toBe(0);
  });

  it('counts interest per upcoming event for the board, nearest first', async () => {
    const rows = await interest.getInterestByRso(1);
    expect(rows).toEqual([
      expect.objectContaining({ eventId: 10, title: 'Still on', interestCount: 2 }),
      expect.objectContaining({ eventId: 11, title: 'Later', interestCount: 0 }),
    ]);
  });
});
