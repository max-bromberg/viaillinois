import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const recordView = vi.hoisted(() => vi.fn());
vi.mock('../../services/viewRecorder.js', () => ({
  recordView,
  startViewRecorder: vi.fn(),
  stopViewRecorder: vi.fn(),
}));

const getEventById = vi.hoisted(() => vi.fn());
const getUserMemberships = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/events.js', async () => {
  const actual = await vi.importActual('../../db/queries/events.js');
  return { ...actual, getEventById };
});
vi.mock('../../db/queries/rsos.js', async () => {
  const actual = await vi.importActual('../../db/queries/rsos.js');
  return { ...actual, getUserMemberships };
});

const app = (await import('../../app.js')).default;

const PUBLIC_EVENT = {
  event_id: 7, rso_id: 3, title: 'Design Review', is_private: 0,
  start_time: '2026-09-20 18:00:00', end_time: '2026-09-20 19:00:00',
};

beforeEach(() => {
  vi.clearAllMocks();
  getEventById.mockResolvedValue(PUBLIC_EVENT);
  getUserMemberships.mockResolvedValue([]);
});

/**
 * A reading is counted where the reading happens, which is the request for one
 * event. Counting it in the browser would miss everything that reads the page
 * without running scripts, and it would be a number anybody could send.
 */
describe('reading an event page', () => {
  it('counts the reading', async () => {
    await request(app).get('/api/v1/events/7').expect(200);
    expect(recordView).toHaveBeenCalledWith(7);
  });

  it('counts nothing for an event that is not there', async () => {
    getEventById.mockResolvedValue(null);
    await request(app).get('/api/v1/events/999').expect(404);
    expect(recordView).not.toHaveBeenCalled();
  });

  /**
   * An internal event refused to somebody outside the organization is not a
   * reading of it. Counting it would let anybody outside run the number up,
   * and it would tell a board that an event only its members can see was read
   * by people who never saw it.
   */
  it('counts nothing when the event is refused as internal', async () => {
    getEventById.mockResolvedValue({ ...PUBLIC_EVENT, is_private: 1 });
    await request(app).get('/api/v1/events/7').expect(404);
    expect(recordView).not.toHaveBeenCalled();
  });

  it('never lets the counting break the page', async () => {
    recordView.mockImplementation(() => { throw new Error('recorder is broken'); });
    await request(app).get('/api/v1/events/7').expect(200);
  });
});
