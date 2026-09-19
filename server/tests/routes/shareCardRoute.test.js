import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getEventById = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/events.js', async () => {
  const actual = await vi.importActual('../../db/queries/events.js');
  return { ...actual, getEventById };
});

const renderCard = vi.hoisted(() => vi.fn());
vi.mock('../../services/cardImage.js', () => ({ renderCard, resetCardCache: vi.fn() }));

const app = (await import('../../app.js')).default;

const EVENT = {
  event_id: 42, title: 'Resume Review Night', rso_name: 'IEEE', is_private: 0,
  start_time: '2026-09-20 18:00:00', end_time: '2026-09-20 20:00:00',
  building: 'Electrical & Computer Eng Bldg', room_number: '1002',
};

beforeEach(() => {
  vi.clearAllMocks();
  getEventById.mockResolvedValue(EVENT);
  renderCard.mockResolvedValue(Buffer.from('\x89PNG\r\n\x1a\n fake', 'binary'));
});

/**
 * The picture a reader fetches when somebody pastes a VIA link.
 *
 * It is served rather than stored, because it is derived from the event and an
 * event's title, time and room all change. It is cached hard at the edge all
 * the same: a link doing the rounds is fetched by every reader that sees it,
 * and none of them should reach a browser on the server.
 */
describe('GET /og/event/:id.png', () => {
  it('answers a picture', async () => {
    const res = await request(app).get('/og/event/42.png').expect(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(renderCard).toHaveBeenCalledWith(expect.objectContaining({ event_id: 42 }));
  });

  it('may be held by every cache between here and the reader', async () => {
    const res = await request(app).get('/og/event/42.png').expect(200);
    expect(res.headers['cache-control']).toMatch(/public/);
    expect(res.headers['cache-control']).toMatch(/max-age=\d{3,}/);
  });

  /**
   * An internal event is not shown to somebody outside the organization, and a
   * picture of one pasted into a public channel would be exactly that. There is
   * no reader to authorize here, so the answer is the shared card.
   */
  it('never draws an internal event, whoever asks', async () => {
    getEventById.mockResolvedValue({ ...EVENT, is_private: 1 });
    await request(app).get('/og/event/42.png').expect(200);
    expect(renderCard).toHaveBeenCalledWith(null);
  });

  it('answers the shared card for an event that is not there', async () => {
    getEventById.mockResolvedValue(null);
    await request(app).get('/og/event/999.png').expect(200);
    expect(renderCard).toHaveBeenCalledWith(null);
  });

  it('answers the shared card rather than failing when the drawing cannot be made', async () => {
    renderCard.mockRejectedValueOnce(new Error('no browser'));
    await request(app).get('/og/event/42.png').expect(500);
  });

  it('serves the shared card on its own address', async () => {
    const res = await request(app).get('/og/card.png').expect(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(renderCard).toHaveBeenCalledWith(null);
  });
});
