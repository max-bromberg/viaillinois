import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../db/queries/events.js', () => ({
  getKioskEvents: vi.fn().mockResolvedValue([]),
  getPublicEvents: vi.fn().mockResolvedValue([]),
  countPublicEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  getAllEvents: vi.fn().mockResolvedValue([]), countAllEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  getVisibleEvents: vi.fn().mockResolvedValue([]), countVisibleEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  getEventsByRso: vi.fn().mockResolvedValue([]), getEventById: vi.fn(),
  updateEvent: vi.fn(), deleteEvent: vi.fn(), findEventsByUid: vi.fn(), createEvent: vi.fn(),
  TIMEFRAMES: ['upcoming', 'archived', 'all'],
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

// Set before app.js is imported, because the production budget reads its
// numbers from the environment as the module loads. Five is low enough that an
// exemption which is not working shows up immediately rather than needing a
// hundred and twenty requests to prove it.
process.env.PUBLIC_REQUESTS_PER_MINUTE = '5';
process.env.PUBLIC_ROWS_PER_HOUR = '10';

const app = (await import('../../app.js')).default;

/**
 * These two exemptions are the ones most likely to break silently, because the
 * budget is mounted on a prefix and Express strips that prefix from req.path.
 * A lobby display polls from one address indefinitely and forever, which is the
 * exact traffic shape a budget would punish, so this asserts the exemption
 * against the real mount order rather than against a test app.
 */
describe('the public budget exemptions, through the real app', () => {
  it('serves a lobby display polling far past the request budget', async () => {
    for (let i = 0; i < 20; i++) {
      expect((await request(app).get('/api/v1/kiosk/events')).status).toBe(200);
    }
  });

  it('serves the term calendar just as often', async () => {
    for (let i = 0; i < 20; i++) {
      expect((await request(app).get('/api/v1/semester/current')).status).toBe(200);
    }
  });
});
