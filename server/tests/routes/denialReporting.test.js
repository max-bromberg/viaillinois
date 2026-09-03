import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const recordDenial = vi.hoisted(() => vi.fn());
vi.mock('../../services/denialRecorder.js', () => ({
  recordDenial,
  startDenialRecorder: vi.fn(), stopDenialRecorder: vi.fn(),
  flushDenials: vi.fn(), bufferSize: () => 0, resetRecorder: vi.fn(),
}));
vi.mock('../../db/queries/events.js', () => ({
  getPublicEvents: vi.fn().mockResolvedValue([]), countPublicEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  getAllEvents: vi.fn().mockResolvedValue([]), countAllEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  getVisibleEvents: vi.fn().mockResolvedValue([]), countVisibleEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  getKioskEvents: vi.fn().mockResolvedValue([]), getEventsByRso: vi.fn().mockResolvedValue([]),
  getEventById: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn(),
  findEventsByUid: vi.fn(), createEvent: vi.fn(),
  TIMEFRAMES: ['upcoming', 'archived', 'all'],
}));

const app = (await import('../../app.js')).default;

beforeEach(() => recordDenial.mockClear());

/**
 * The point of the table is to answer one question: are readers being turned
 * away, and how often. That is only answerable if every path that turns
 * somebody away says so, so this asserts the wiring rather than the counting.
 */
describe('refusals reach the denial recorder', () => {
  it('reports a refusal to page too deep', async () => {
    await request(app).get('/api/v1/events?offset=99999');
    expect(recordDenial).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'pagination_refused', route: '/api/v1/events' })
    );
  });

  it('reports a login refused by the existing limiter', async () => {
    for (let i = 0; i < 12; i++) {
      await request(app).post('/auth/login').send({ net_id: 'x', password: 'y' });
    }
    expect(recordDenial).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'rate_limited' })
    );
  });

  it('does not report a request it served', async () => {
    await request(app).get('/api/v1/events');
    expect(recordDenial).not.toHaveBeenCalled();
  });
});
