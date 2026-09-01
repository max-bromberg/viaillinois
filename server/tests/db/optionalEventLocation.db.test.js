import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let conn;

/**
 * An event's location is optional. Some events happen somewhere VIA has no
 * room record for, such as a video call or a venue off campus, and an imported
 * calendar file carries whatever free text the author typed.
 */
describe('optional event location', () => {
  beforeAll(async () => {
    await startTestDb();
    await resetTestDb();
    process.env.DB_HOST = testDbConfig.host;
    process.env.DB_PORT = String(testDbConfig.port);
    process.env.DB_USER = testDbConfig.user;
    process.env.DB_PASSWORD = testDbConfig.password;
    process.env.DB_NAME = testDbConfig.database;
    const { applyMigrations } = await import('../../db/migrate.ts');
    await applyMigrations();
    conn = await mysql.createConnection(testDbConfig);

    await conn.query("INSERT INTO RSOs (name) VALUES ('Test RSO')");
    await conn.query(
      "INSERT INTO Users (net_id, full_name, email) VALUES ('tester', 'Test User', 'tester@illinois.edu')"
    );
    await conn.query(
      "INSERT INTO Locations (building, room_number, max_capacity) VALUES ('Everitt Laboratory', '2310', 45)"
    );
  }, 180_000);

  afterAll(async () => {
    if (conn) await conn.end();
  });

  async function insertEvent({ locationId = null, locationText = null, title }) {
    const [rso] = await conn.query('SELECT rso_id FROM RSOs LIMIT 1');
    const [result] = await conn.query(
      `INSERT INTO Events (rso_id, created_by, location_id, location_text, title, start_time, end_time)
       VALUES (?, 'tester', ?, ?, ?, '2026-10-01 18:00:00', '2026-10-01 19:00:00')`,
      [rso[0].rso_id, locationId, locationText, title]
    );
    return result.insertId;
  }

  it('accepts an event with no location at all', async () => {
    const id = await insertEvent({ title: 'Location still being decided' });
    const [rows] = await conn.query('SELECT location_id, location_text FROM Events WHERE event_id = ?', [id]);
    expect(rows[0].location_id).toBeNull();
    expect(rows[0].location_text).toBeNull();
  });

  it('accepts an event whose location is free text', async () => {
    const id = await insertEvent({ locationText: 'Zoom', title: 'Remote office hours' });
    const [rows] = await conn.query('SELECT location_id, location_text FROM Events WHERE event_id = ?', [id]);
    expect(rows[0].location_id).toBeNull();
    expect(rows[0].location_text).toBe('Zoom');
  });

  it('still accepts an event in a known room', async () => {
    const [loc] = await conn.query('SELECT location_id FROM Locations LIMIT 1');
    const id = await insertEvent({ locationId: loc[0].location_id, title: 'Weekly meeting' });
    const [rows] = await conn.query('SELECT location_id FROM Events WHERE event_id = ?', [id]);
    expect(rows[0].location_id).toBe(loc[0].location_id);
  });

  it('still refuses a location_id that does not exist', async () => {
    await expect(insertEvent({ locationId: 999999, title: 'Nowhere' })).rejects.toThrow();
  });
});
