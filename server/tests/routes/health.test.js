import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const ping = vi.fn();
const currentVersion = vi.fn();

vi.mock('../../db/pool.js', () => ({
  default: { query: (...args) => ping(...args) },
  query:   (...args) => ping(...args),
}));
vi.mock('../../db/migrate.ts', () => ({ currentVersion }));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

const app = (await import('../../app.js')).default;

describe('GET /health', () => {
  beforeEach(() => { ping.mockReset(); currentVersion.mockReset(); });

  it('returns 200 with the applied migration version when the database is reachable', async () => {
    ping.mockResolvedValue([[{ ok: 1 }], null]);
    currentVersion.mockResolvedValue('0001_advanced_objects');
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.migrationVersion).toBe('0001_advanced_objects');
  });

  it('returns 503 when the database is unreachable', async () => {
    ping.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unavailable');
  });

  it('returns 503 when no migration has been applied', async () => {
    ping.mockResolvedValue([[{ ok: 1 }], null]);
    currentVersion.mockResolvedValue(null);
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
  });
});
