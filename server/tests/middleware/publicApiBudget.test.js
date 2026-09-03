import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createPublicApiBudget } from '../../middleware/publicApiBudget.js';
import { BUDGET_MESSAGE } from '../../lib/busyResponse.js';

/** An app that serves a fixed number of rows, behind the budget under test. */
function appWith(options, rowsPerResponse = 1) {
  const app = express();
  app.use(createPublicApiBudget(options));
  app.get('/api/v1/events', (_req, res) => {
    res.json({ events: Array.from({ length: rowsPerResponse }, () => ({})) });
  });
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
}

const onDenied = vi.fn();
const base = () => ({
  requestsPerWindow: 5, requestWindowMs: 60000,
  rowsPerWindow: 100, rowWindowMs: 3600000,
  retryAfterSeconds: 60, onDenied,
  isVerifiedCrawler: async () => false,
});

beforeEach(() => onDenied.mockClear());

/**
 * The budgets exist to make collecting the whole corpus impractical while
 * leaving ordinary anonymous reading alone. Every consequence here is capped
 * at one minute: nothing bans, nothing escalates, and nothing outlives the
 * window, because on a campus network a shared address may be hundreds of
 * students rather than one collector.
 */
describe('createPublicApiBudget', () => {
  it('serves an ordinary reader', async () => {
    const res = await request(appWith(base())).get('/api/v1/events');
    expect(res.status).toBe(200);
  });

  it('refuses a caller past the request budget, and says when to return', async () => {
    const app = appWith(base());
    for (let i = 0; i < 5; i++) await request(app).get('/api/v1/events');
    const res = await request(app).get('/api/v1/events');
    expect(res.status).toBe(429);
    expect(res.body.error).toBe(BUDGET_MESSAGE);
    expect(res.headers['retry-after']).toBe('60');
  });

  it('refuses a caller past the row budget even when it paced itself', async () => {
    const app = appWith({ ...base(), requestsPerWindow: 1000 }, 60);
    await request(app).get('/api/v1/events');
    await request(app).get('/api/v1/events');
    const res = await request(app).get('/api/v1/events');
    expect(res.status).toBe(429);
  });

  it('never bans, so the refusal window is the whole of the consequence', async () => {
    const app = appWith(base());
    for (let i = 0; i < 6; i++) await request(app).get('/api/v1/events');
    const res = await request(app).get('/api/v1/events');
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(60);
  });

  it('leaves a signed in reader alone, because a NetID is accountable', async () => {
    const app = express();
    app.use((req, _res, next) => { req.user = { net_id: 'mbrom' }; next(); });
    app.use(createPublicApiBudget(base()));
    app.get('/api/v1/events', (_req, res) => res.json({ events: [{}] }));
    for (let i = 0; i < 20; i++) {
      expect((await request(app).get('/api/v1/events')).status).toBe(200);
    }
  });

  it('leaves the health endpoint alone at any rate', async () => {
    const app = appWith(base());
    for (let i = 0; i < 20; i++) {
      expect((await request(app).get('/health')).status).toBe(200);
    }
  });

  it('leaves a verified crawler alone, because search matters more than scraping', async () => {
    const app = appWith({ ...base(), isVerifiedCrawler: async () => true });
    for (let i = 0; i < 20; i++) {
      expect((await request(app).get('/api/v1/events')).status).toBe(200);
    }
  });

  it('reports the refusal so the denial log can count it', async () => {
    const app = appWith(base());
    for (let i = 0; i < 6; i++) await request(app).get('/api/v1/events');
    expect(onDenied).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'rate_limited', authenticated: false })
    );
  });

  it('names the row budget when that is what ran out', async () => {
    const app = appWith({ ...base(), requestsPerWindow: 1000 }, 60);
    await request(app).get('/api/v1/events');
    await request(app).get('/api/v1/events');
    await request(app).get('/api/v1/events');
    expect(onDenied).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'row_budget' })
    );
  });

  it('does not charge a caller for rows it was refused', async () => {
    const app = appWith(base(), 1);
    for (let i = 0; i < 6; i++) await request(app).get('/api/v1/events');
    // Six requests, five of them served one row each, so exactly one refusal.
    expect(onDenied).toHaveBeenCalledTimes(1);
  });
});
