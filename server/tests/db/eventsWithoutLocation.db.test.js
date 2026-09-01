import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let events;

/**
 * An event whose location is free text, or absent entirely, is still an event.
 * Every listing query joined Locations to get the building and room, and an
 * inner join drops exactly the rows that have no room, so these events would
 * have been accepted by the database and then never shown to anyone.
 */
describe('events without a room', () => {

  /**
   * The shared connection pool has to be closed when this suite is done.
   * Database suites run one after another in one process, and a later suite
   * that drops and recreates the database leaves any connection still open
   * here pointing at something that no longer exists, which then fails a
   * completely unrelated test.
   */
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
    events = await import('../../db/queries/events.js');
  }, 180_000);

  beforeEach(async () => {
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('DELETE FROM Events');
    await conn.query('DELETE FROM Locations');
    await conn.query('DELETE FROM RSOs');
    await conn.query('DELETE FROM Users');
    await conn.query("INSERT INTO RSOs (rso_id, name) VALUES (1, 'IEEE')");
    await conn.query("INSERT INTO Users (net_id, full_name, email) VALUES ('tester', 'T', 't@illinois.edu')");
    await conn.query(
      "INSERT INTO Locations (location_id, building, room_number, max_capacity) VALUES (1, 'Everitt Laboratory', '2310', 45)"
    );
    await conn.query(`
      INSERT INTO Events (event_id, rso_id, created_by, location_id, location_text, title, start_time, end_time, is_private) VALUES
        (1, 1, 'tester', 1,    NULL,   'In a room',   '2027-03-01 18:00:00', '2027-03-01 19:00:00', 0),
        (2, 1, 'tester', NULL, 'Zoom', 'On a call',   '2027-03-02 18:00:00', '2027-03-02 19:00:00', 0),
        (3, 1, 'tester', NULL, NULL,   'Undecided',   '2027-03-03 18:00:00', '2027-03-03 19:00:00', 0)`);
    await conn.end();
  });

  it('lists all three in the public feed', async () => {
    const rows = await events.getPublicEvents({});
    expect(rows.map(r => r.title).sort()).toEqual(['In a room', 'On a call', 'Undecided']);
  });

  it('carries the room for the one that has one', async () => {
    const rows = await events.getPublicEvents({});
    const inRoom = rows.find(r => r.title === 'In a room');
    expect(inRoom.building).toBe('Everitt Laboratory');
    expect(inRoom.room_number).toBe('2310');
  });

  it('carries the free text for the one that has that instead', async () => {
    const rows = await events.getPublicEvents({});
    const onCall = rows.find(r => r.title === 'On a call');
    expect(onCall.building).toBeNull();
    expect(onCall.location_text).toBe('Zoom');
  });

  it('carries nothing for the one with neither', async () => {
    const rows = await events.getPublicEvents({});
    const undecided = rows.find(r => r.title === 'Undecided');
    expect(undecided.building).toBeNull();
    expect(undecided.location_text).toBeNull();
  });

  it('counts all three', async () => {
    const [{ total }] = await events.countPublicEvents({});
    expect(total).toBe(3);
  });

  it('shows all three on the kiosk', async () => {
    const rows = await events.getKioskEvents(10);
    expect(rows).toHaveLength(3);
  });

  it('returns one by id with its free text location', async () => {
    const event = await events.getEventById(2);
    expect(event.location_text).toBe('Zoom');
  });

  it('lists all three for the RSO', async () => {
    expect(await events.getEventsByRso(1)).toHaveLength(3);
  });

  it('lists all three for a signed in viewer', async () => {
    expect(await events.getVisibleEvents({}, [1])).toHaveLength(3);
  });
});
