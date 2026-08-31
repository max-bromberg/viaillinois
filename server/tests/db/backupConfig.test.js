import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { adminConfigFromEnv } from '../../db/backup/config.js';

const KEYS = ['DB_HOST','DB_PORT','DB_USER','DB_PASSWORD','DB_NAME','DB_ADMIN_USER','DB_ADMIN_PASSWORD'];
let saved;

beforeEach(() => { saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]])); KEYS.forEach(k => delete process.env[k]); });
afterEach(() => { KEYS.forEach(k => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); });

/**
 * Backup verification creates a scratch database and restore drops and
 * recreates the application database. The application user cannot do either,
 * so these steps use an administrative account.
 */
describe('backup credentials', () => {
  it('defaults to root with the database password, which is how the compose file sets root up', () => {
    process.env.DB_USER = 'via';
    process.env.DB_PASSWORD = 'secret';
    const config = adminConfigFromEnv();
    expect(config.user).toBe('root');
    expect(config.password).toBe('secret');
  });

  it('prefers an explicit administrative account when one is configured', () => {
    process.env.DB_USER = 'via';
    process.env.DB_PASSWORD = 'secret';
    process.env.DB_ADMIN_USER = 'deployer';
    process.env.DB_ADMIN_PASSWORD = 'other';
    const config = adminConfigFromEnv();
    expect(config.user).toBe('deployer');
    expect(config.password).toBe('other');
  });

  it('carries the host, port and database from the standard settings', () => {
    process.env.DB_HOST = 'db';
    process.env.DB_PORT = '3307';
    process.env.DB_NAME = 'via_prod';
    const config = adminConfigFromEnv();
    expect(config).toMatchObject({ host: 'db', port: 3307, database: 'via_prod' });
  });

  it('falls back to the documented defaults', () => {
    expect(adminConfigFromEnv()).toMatchObject({ host: 'localhost', port: 3306, database: 'via' });
  });
});
