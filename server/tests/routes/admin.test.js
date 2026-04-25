import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../db/queries/users.js', () => ({
  getAllLocalUsers:  vi.fn().mockResolvedValue([
    { net_id: 'testuser', full_name: 'Test User', email: 'test@illinois.edu' },
  ]),
  upsertUser:         vi.fn().mockResolvedValue(undefined),
  createLocalAccount: vi.fn().mockResolvedValue(undefined),
  updateUser:         vi.fn().mockResolvedValue({ affectedRows: 1 }),
  updateLocalPassword:vi.fn().mockResolvedValue({ affectedRows: 1 }),
  deleteUser:         vi.fn().mockResolvedValue({ affectedRows: 1 }),
  getUserByNetId:     vi.fn(),
  getLocalAccount:    vi.fn(),
}));
vi.mock('../../db/queries/rso.js', () => ({
  getMembership: vi.fn(), getUserMemberships: vi.fn().mockResolvedValue([]),
}));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed_pw') } }));

vi.mock('../../db/queries/pollLog.js', () => ({
  getLatestRunPerService:   vi.fn().mockResolvedValue([
    { service: 'astra', log_id: 1, started_at: '2026-04-22T10:00:00Z',
      finished_at: '2026-04-22T10:01:00Z', rows_processed: 50, rows_skipped: 2,
      error_count: 0, last_error: null, metadata: null },
  ]),
  getRunHistory:            vi.fn().mockResolvedValue([]),
  getUnknownCodeFrequency:  vi.fn().mockResolvedValue([
    { raw_code: 'NSRC', occurrences: 3, last_seen: '2026-04-22T10:01:00Z' },
  ]),
}));

vi.mock('../../lib/pollerUtils.js', () => ({
  startPollerRun: vi.fn().mockResolvedValue(42),
}));

vi.mock('../../services/astraPoller.js',       () => ({ runOnce: vi.fn(), start: vi.fn(), stop: vi.fn(), default: { start: vi.fn(), stop: vi.fn() } }));
vi.mock('../../services/facilitiesPoller.js',  () => ({ runOnce: vi.fn(), start: vi.fn(), stop: vi.fn(), default: { start: vi.fn(), stop: vi.fn() } }));
vi.mock('../../services/coursesPoller.js',     () => ({ runOnce: vi.fn(), start: vi.fn(), stop: vi.fn(), default: { start: vi.fn(), stop: vi.fn() } }));

const app = (await import('../../app.js')).default;

const adminToken = jwt.sign(
  { net_id: 'admin1', is_global_admin: true },
  process.env.JWT_SECRET || 'dev_secret'
);
const userToken = jwt.sign(
  { net_id: 'plain1', is_global_admin: false },
  process.env.JWT_SECRET || 'dev_secret'
);

describe('GET /api/v1/admin/users', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/admin/users');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Cookie', `via_token=${userToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 with users array for global admin', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Cookie', `via_token=${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users[0].net_id).toBe('testuser');
  });
});

describe('POST /api/v1/admin/users', () => {
  it('returns 400 when fields missing', async () => {
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Cookie', `via_token=${adminToken}`)
      .send({ net_id: 'new1' });
    expect(res.status).toBe(400);
  });

  it('returns 201 with all fields', async () => {
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Cookie', `via_token=${adminToken}`)
      .send({ net_id: 'new1', full_name: 'New User', email: 'new@illinois.edu', password: 'pass' });
    expect(res.status).toBe(201);
  });
});

describe('PUT /api/v1/admin/users/:netId/password', () => {
  it('returns 400 when password missing', async () => {
    const res = await request(app)
      .put('/api/v1/admin/users/testuser/password')
      .set('Cookie', `via_token=${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 200 with valid password', async () => {
    const res = await request(app)
      .put('/api/v1/admin/users/testuser/password')
      .set('Cookie', `via_token=${adminToken}`)
      .send({ password: 'newpass' });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/v1/admin/users/:netId', () => {
  it('returns 404 when user not found', async () => {
    const { deleteUser } = await import('../../db/queries/users.js');
    deleteUser.mockResolvedValueOnce({ affectedRows: 0 });
    const res = await request(app)
      .delete('/api/v1/admin/users/nobody')
      .set('Cookie', `via_token=${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('returns 200 on success', async () => {
    const res = await request(app)
      .delete('/api/v1/admin/users/testuser')
      .set('Cookie', `via_token=${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/admin/poll-status', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/admin/poll-status');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .get('/api/v1/admin/poll-status')
      .set('Cookie', `via_token=${userToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 with pollStatus array for global admin', async () => {
    const res = await request(app)
      .get('/api/v1/admin/poll-status')
      .set('Cookie', `via_token=${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.pollStatus)).toBe(true);
  });
});

describe('GET /api/v1/admin/poll-history/:service', () => {
  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .get('/api/v1/admin/poll-history/astra')
      .set('Cookie', `via_token=${userToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 for unknown service', async () => {
    const res = await request(app)
      .get('/api/v1/admin/poll-history/bogus')
      .set('Cookie', `via_token=${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('returns 200 with history array for valid service', async () => {
    const res = await request(app)
      .get('/api/v1/admin/poll-history/astra')
      .set('Cookie', `via_token=${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.history)).toBe(true);
  });
});

describe('GET /api/v1/admin/poll-unknown-codes', () => {
  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .get('/api/v1/admin/poll-unknown-codes')
      .set('Cookie', `via_token=${userToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 with unknownCodes array for global admin', async () => {
    const res = await request(app)
      .get('/api/v1/admin/poll-unknown-codes')
      .set('Cookie', `via_token=${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.unknownCodes)).toBe(true);
    expect(res.body.unknownCodes[0].raw_code).toBe('NSRC');
  });
});

describe('POST /api/v1/admin/poll-trigger/:service', () => {
  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .post('/api/v1/admin/poll-trigger/astra')
      .set('Cookie', `via_token=${userToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 for unknown service', async () => {
    const res = await request(app)
      .post('/api/v1/admin/poll-trigger/bogus')
      .set('Cookie', `via_token=${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('returns 200 with logId for valid service', async () => {
    const res = await request(app)
      .post('/api/v1/admin/poll-trigger/astra')
      .set('Cookie', `via_token=${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.logId).toBe(42);
  });
});
