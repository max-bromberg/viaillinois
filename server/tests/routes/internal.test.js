import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const recordDenial = vi.hoisted(() => vi.fn());
vi.mock('../../services/denialRecorder.js', () => ({
  recordDenial,
  startDenialRecorder: vi.fn(), stopDenialRecorder: vi.fn(),
  flushDenials: vi.fn(), bufferSize: () => 0, resetRecorder: vi.fn(),
}));
const getLinkByDiscordUserId = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/discordLinks.ts', () => ({ getLinkByDiscordUserId }));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

const TOKEN = 'c'.repeat(64);
// Both read as the module loads. The budget is set low so that an internal
// request being counted against it would show within one test.
process.env.BOT_SERVICE_TOKEN = TOKEN;
process.env.PUBLIC_REQUESTS_PER_MINUTE = '5';

const app = (await import('../../app.js')).default;
const APP_VERSION = JSON.parse(
  (await import('node:fs')).readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
).version;

beforeEach(() => { recordDenial.mockClear(); getLinkByDiscordUserId.mockReset(); });

const asBot = path => request(app).get(path).set('Authorization', `Bearer ${TOKEN}`);

/**
 * The router has no endpoints yet. What is tested here is the wiring that every
 * endpoint will sit behind: the guard, the acting middleware, the version
 * header, the error shape, and the exemption from the public budget.
 */
describe('/internal/v1, through the real app', () => {
  it('refuses a request without the service token and counts it', async () => {
    const res = await request(app).get('/internal/v1/events');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: expect.any(String), code: 'unauthorized' });
    expect(recordDenial).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'internal_unauthorized', route: '/internal/v1/events' })
    );
  });

  it('answers 404 to a request that came through the proxy', async () => {
    const res = await request(app).get('/internal/v1/events')
      .set('Authorization', `Bearer ${TOKEN}`).set('X-Forwarded-For', '203.0.113.7');
    expect(res.status).toBe(404);
  });

  it('answers an unknown path with the error shape and the version header', async () => {
    const res = await asBot('/internal/v1/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: expect.any(String), code: 'not_found' });
    expect(res.headers['x-via-internal-api-version']).toBe(APP_VERSION);
  });

  it('refuses an acting identifier with no link before reaching any route', async () => {
    getLinkByDiscordUserId.mockResolvedValue(null);
    const res = await asBot('/internal/v1/nothing-here').set('X-Via-Acting-Discord-User', '123456789012345678');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('not_linked');
    expect(getLinkByDiscordUserId).toHaveBeenCalledWith('123456789012345678');
  });

  it('lets a linked person through to the routes', async () => {
    getLinkByDiscordUserId.mockResolvedValue({ netId: 'alice', isGlobalAdmin: 0 });
    const res = await asBot('/internal/v1/nothing-here').set('X-Via-Acting-Discord-User', '123456789012345678');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('is not counted against the public budget', async () => {
    for (let i = 0; i < 20; i++) {
      expect((await asBot('/internal/v1/nothing-here')).status).toBe(404);
    }
    expect(recordDenial).not.toHaveBeenCalled();
  });

  it('does not put the version header on the public API', async () => {
    const res = await request(app).get('/api/v1/semester/current');
    expect(res.headers['x-via-internal-api-version']).toBeUndefined();
  });
});
