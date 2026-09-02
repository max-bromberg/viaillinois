import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let series;
let events;

const SERIES = {
  rso_id: 1,
  created_by: 'tester',
  frequency: 'weekly',
  interval_weeks: 1,
  days_of_week: 'Tue',
  starts_on: '2027-09-07',
  ends_on: '2027-09-21',
  start_of_day: '18:00:00',
  duration_minutes: 90,
};

const OCCURRENCES = [
  { date: '2027-09-07', start: '2027-09-07 18:00:00', end: '2027-09-07 19:30:00' },
  { date: '2027-09-14', start: '2027-09-14 18:00:00', end: '2027-09-14 19:30:00' },
  { date: '2027-09-21', start: '2027-09-21 18:00:00', end: '2027-09-21 19:30:00' },
];

const EVENT = {
  rso_id: 1,
  created_by: 'tester',
  location_id: 1,
  location_text: null,
  title: 'IEEE Weekly Meeting',
  description: 'Every week in term.',
  is_private: false,
};

/**
 * A series is a rule row and one ordinary event row per occurrence. What that
 * arrangement has to hold is checked here against real MySQL: that the rows are
 * written together or not at all, that the foreign key takes the occurrences
 * with the series, and that a series wide edit moves every week without moving
 * any of them onto another day.
 */
describe('event series', () => {
  afterAll(async () => {
    const pool = (await import('../../db/pool.js')).default;
    await pool.end();
  });

  beforeAll(async () => {
    await startTestDb();
    process.env.DB_HOST = testDbConfig.host;
    process.env.DB_PORT = String(testDbConfig.port);
    process.env.DB_USER = testDbConfig.user;
    process.env.DB_PASSWORD = testDbConfig.password;
    process.env.DB_NAME = testDbConfig.database;
    const { applyMigrations } = await import('../../db/migrate.ts');
    await resetTestDb();
    await applyMigrations();
    series = await import('../../db/queries/eventSeries.js');
    events = await import('../../db/queries/events.js');
  }, 180_000);

  beforeEach(async () => {
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('DELETE FROM Events');
    await conn.query('DELETE FROM Event_Series');
    await conn.query('DELETE FROM Facility_Reservations');
    await conn.query('DELETE FROM Locations');
    await conn.query('DELETE FROM RSOs');
    await conn.query('DELETE FROM Users');
    await conn.query("INSERT INTO RSOs (rso_id, name) VALUES (1, 'IEEE')");
    await conn.query("INSERT INTO Users (net_id, full_name, email) VALUES ('tester', 'T', 't@illinois.edu')");
    await conn.query(
      "INSERT INTO Locations (location_id, building, room_number, max_capacity) VALUES (1, 'Everitt Laboratory', '2310', 45)"
    );
    await conn.end();
  });

  const create = (overrides = {}) => series.createSeriesWithOccurrences({
    series: SERIES, occurrences: OCCURRENCES, event: EVENT, tagNames: ['Weekly Meeting'], ...overrides,
  });

  it('writes the rule and one event for every occurrence', async () => {
    const { seriesId, eventIds } = await create();
    expect(eventIds).toHaveLength(3);

    const stored = await series.getSeriesById(seriesId);
    expect(stored).toMatchObject({
      daysOfWeek: 'Tue', intervalWeeks: 1, startOfDay: '18:00:00', durationMinutes: 90,
    });

    const occurrences = await series.occurrencesOfSeries(seriesId);
    expect(occurrences.map(o => o.start_time)).toEqual(OCCURRENCES.map(o => o.start));
  });

  it('makes every occurrence an ordinary event, so the feed shows them', async () => {
    await create();
    const feed = await events.getPublicEvents({ startDate: '2027-09-01', endDate: '2027-09-30' });
    expect(feed).toHaveLength(3);
    expect(feed[0].title).toBe('IEEE Weekly Meeting');
    expect(feed[0].tags).toBe('Weekly Meeting');
  });

  it('takes the occurrences with the series when the series goes', async () => {
    const { seriesId } = await create();
    await series.deleteSeries(seriesId);
    expect(await series.occurrencesOfSeries(seriesId)).toEqual([]);
    expect(await events.countPublicEvents({})).toEqual([{ total: 0 }]);
  });

  it('moves the hour of every week without moving any of them to another day', async () => {
    const { seriesId } = await create();
    await series.applyToSeries(seriesId, {
      fields: { title: 'Moved to seven' }, startOfDay: '19:00:00', durationMinutes: 60,
    });
    const occurrences = await series.occurrencesOfSeries(seriesId);
    expect(occurrences.map(o => o.start_time)).toEqual([
      '2027-09-07 19:00:00', '2027-09-14 19:00:00', '2027-09-21 19:00:00',
    ]);
    expect(occurrences.map(o => o.end_time)).toEqual([
      '2027-09-07 20:00:00', '2027-09-14 20:00:00', '2027-09-21 20:00:00',
    ]);
  });

  it('leaves an occurrence alone once it has been edited on its own', async () => {
    const { seriesId, eventIds } = await create();
    await series.detachEvent(eventIds[1]);
    await series.applyToSeries(seriesId, { fields: { title: 'Renamed' } });

    const titles = await Promise.all(eventIds.map(async id => (await events.getEventById(id)).title));
    expect(titles).toEqual(['Renamed', 'IEEE Weekly Meeting', 'Renamed']);
  });

  it('applies an edit from one week onwards to that week and the later ones', async () => {
    const { seriesId, eventIds } = await create();
    await series.applyToSeries(seriesId, {
      from: '2027-09-14 00:00:00', fields: { title: 'From the fourteenth' },
    });
    const titles = await Promise.all(eventIds.map(async id => (await events.getEventById(id)).title));
    expect(titles).toEqual(['IEEE Weekly Meeting', 'From the fourteenth', 'From the fourteenth']);
  });

  it('ends the series where the occurrences do when the later ones are deleted', async () => {
    const { seriesId } = await create();
    const result = await series.deleteOccurrencesFrom(seriesId, '2027-09-14 00:00:00');
    expect(result.affectedRows).toBe(2);
    expect((await series.getSeriesById(seriesId)).endsOn).toBe('2027-09-07');
  });

  it('removes the series once its last occurrence is deleted', async () => {
    const { seriesId } = await create();
    await series.deleteOccurrencesFrom(seriesId, '2027-09-01 00:00:00');
    expect(await series.getSeriesById(seriesId)).toBeNull();
  });

  it('reports what already occupies a room, whether it is an event or a booking', async () => {
    await create();
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query(
      `INSERT INTO Facility_Reservations (location_id, customer, event_name, start_time, end_time)
       VALUES (1, 'Facilities', 'Maintenance', '2027-09-28 17:00:00', '2027-09-28 20:00:00')`
    );
    await conn.end();

    const busy = await series.busyInRoom(1, '2027-09-01 00:00:00', '2027-10-01 00:00:00');
    expect(busy).toHaveLength(4);
  });

  it('finds a series again by the identifier the calendar gave it', async () => {
    const { seriesId } = await create({
      series: { ...SERIES, external_uid: 'weekly-meeting@ieee' },
    });
    const found = await series.findSeriesByUid(1, ['weekly-meeting@ieee']);
    expect(found.map(row => row.seriesId)).toEqual([seriesId]);
    expect(await series.findSeriesByUid(1, ['nothing-like-it'])).toEqual([]);
  });
});
