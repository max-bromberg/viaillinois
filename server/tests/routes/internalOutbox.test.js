import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../services/denialRecorder.js', () => ({
  recordDenial: vi.fn(),
  startDenialRecorder: vi.fn(), stopDenialRecorder: vi.fn(),
  flushDenials: vi.fn(), bufferSize: () => 0, resetRecorder: vi.fn(),
}));
vi.mock('../../db/queries/discordLinks.ts', () => ({ getLinkByDiscordUserId: vi.fn() }));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

const outbox = vi.hoisted(() => ({ readOutbox: vi.fn() }));
vi.mock('../../db/queries/outbox.ts', async () => ({
  ...(await import('../support/outboxMock.js')).outboxMock(),
  ...outbox,
}));

const TOKEN = 'f'.repeat(64);
process.env.BOT_SERVICE_TOKEN = TOKEN;

const app = (await import('../../app.js')).default;
const { PAGING_LIMITS } = await import('../../lib/pagination.js');

const asBot = path => request(app).get(path).set('Authorization', `Bearer ${TOKEN}`);

const ENTRY = {
  outbox_id: 41, kind: 'event.created', subject_type: 'event', subject_id: '10',
  rso_id: 1, payload: { event: { event_id: 10 } }, created_at: '2026-09-05 12:00:00',
};

beforeEach(() => {
  vi.clearAllMocks();
  outbox.readOutbox.mockResolvedValue([ENTRY, { ...ENTRY, outbox_id: 42, kind: 'event.updated' }]);
});

/**
 * The outbox endpoint is how the Discord bot learns what changed. The bot
 * keeps the cursor, so everything this endpoint has to get right is the order,
 * the cursor it hands back, and refusing a cursor that is not a number rather
 * than reading it as one.
 */
describe('GET /internal/v1/outbox', () => {
  it('answers the entries after the cursor, in order, with the cursor to ask from next', async () => {
    const res = await asBot('/internal/v1/outbox?after=40');
    expect(res.status).toBe(200);
    expect(res.body.entries.map(entry => entry.outbox_id)).toEqual([41, 42]);
    expect(res.body.next_after).toBe(42);
    expect(outbox.readOutbox).toHaveBeenCalledWith({ after: 40, limit: PAGING_LIMITS.outbox.defaultLimit });
  });

  it('reads from the beginning when no cursor is given', async () => {
    await asBot('/internal/v1/outbox');
    expect(outbox.readOutbox).toHaveBeenCalledWith({ after: 0, limit: PAGING_LIMITS.outbox.defaultLimit });
  });

  it('hands back the cursor it was given when there is nothing new', async () => {
    outbox.readOutbox.mockResolvedValue([]);
    const res = await asBot('/internal/v1/outbox?after=99');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ entries: [], next_after: 99 });
  });

  it('serves at most the ceiling, however many are asked for', async () => {
    await asBot(`/internal/v1/outbox?limit=${PAGING_LIMITS.outbox.maxLimit + 500}`);
    expect(outbox.readOutbox).toHaveBeenCalledWith({ after: 0, limit: PAGING_LIMITS.outbox.maxLimit });
  });

  it('serves the number of entries asked for when it is under the ceiling', async () => {
    await asBot('/internal/v1/outbox?limit=5');
    expect(outbox.readOutbox).toHaveBeenCalledWith({ after: 0, limit: 5 });
  });

  it('refuses a cursor that is not a whole number', async () => {
    const res = await asBot('/internal/v1/outbox?after=yesterday');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
    expect(outbox.readOutbox).not.toHaveBeenCalled();
  });

  it('refuses a limit that is not a whole number', async () => {
    const res = await asBot('/internal/v1/outbox?limit=lots');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
    expect(outbox.readOutbox).not.toHaveBeenCalled();
  });

  it('needs no acting person, because the outbox belongs to the service', async () => {
    const res = await asBot('/internal/v1/outbox');
    expect(res.status).toBe(200);
  });

  it('is refused without the service token, like everything else under the prefix', async () => {
    const res = await request(app).get('/internal/v1/outbox');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('unauthorized');
  });
});
