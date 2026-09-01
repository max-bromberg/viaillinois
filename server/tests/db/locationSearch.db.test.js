import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let searchLocations, clearLocationCache;

describe('searchLocations', () => {

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
    ({ searchLocations, clearLocationCache } = await import('../../db/queries/locations.js'));
  }, 180_000);

  beforeEach(async () => {
    await resetTestDb();
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query(`
      CREATE TABLE Locations (
        location_id INT AUTO_INCREMENT PRIMARY KEY,
        building VARCHAR(50) NOT NULL,
        room_number VARCHAR(20) NOT NULL,
        max_capacity INT NOT NULL,
        has_av_equipment TINYINT NOT NULL DEFAULT 0,
        UNIQUE KEY uq_room (building, room_number)
      )`);
    await conn.query(`
      INSERT INTO Locations (building, room_number, max_capacity) VALUES
        ('Electrical & Computer Eng Bldg', '1002', 240),
        ('Electrical & Computer Eng Bldg', '1013', 120),
        ('Electrical and Computer Engineering Building', '3017', 30),
        ('Siebel Center for Comp Sci', '1404', 150),
        ('Everitt Laboratory', '1002', 45)`);
    await conn.end();
    clearLocationCache();
  });

  it('finds rooms by building code, across both stored spellings', async () => {
    const results = await searchLocations('ECEB', 10);
    expect(results.map(r => r.room_number).sort()).toEqual(['1002', '1013', '3017']);
  });

  it('finds one room from a code written onto a room number', async () => {
    const results = await searchLocations('eceb1002', 10);
    expect(results).toHaveLength(1);
    expect(results[0].building).toBe('Electrical & Computer Eng Bldg');
  });

  it('returns the capacity, which the picker shows', async () => {
    const [first] = await searchLocations('siebel', 10);
    expect(first.max_capacity).toBe(150);
  });

  it('honours the limit', async () => {
    expect(await searchLocations('ECEB', 2)).toHaveLength(2);
  });

  it('returns nothing for a term that matches no room', async () => {
    expect(await searchLocations('krannert', 10)).toEqual([]);
  });

  it('sees rooms added after an earlier search once the cache expires', async () => {
    await searchLocations('ECEB', 10);
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query(
      "INSERT INTO Locations (building, room_number, max_capacity) VALUES ('Electrical & Computer Eng Bldg', '2013', 60)"
    );
    await conn.end();
    clearLocationCache();
    expect(await searchLocations('ECEB', 10)).toHaveLength(4);
  });
});
