import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const renderCard = vi.fn();
const getEventById = vi.fn();

vi.mock('../../services/cardImage.js', () => ({
  renderCard: (...a) => renderCard(...a),
  resetCardCache: vi.fn(),
}));
vi.mock('../../db/queries/events.js', () => ({
  getEventById: (...a) => getEventById(...a),
  getPublicEvents: vi.fn().mockResolvedValue([]),
  countPublicEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  countAllEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  updateEvent: vi.fn(), deleteEvent: vi.fn(), findEventsByUid: vi.fn(), createEvent: vi.fn(),
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(), inviteUser: vi.fn(),
}));

const app = (await import('../../app.js')).default;

/**
 * Drawing a card is the most expensive thing this service does, and the address
 * is public.
 *
 * The personal calendar sits outside the public API budget too, and it was
 * given a ceiling of its own for exactly this reason. The card address was not,
 * so it was the one public route that could open a headless browser with
 * nothing counting how often.
 *
 * The identifier made it worse. parseInt reads the digits at the front and
 * ignores the rest, so /og/event/42abc.png, /og/event/42.png.png and
 * /og/event/42<anything>.png all resolve to event 42 while being different
 * addresses as far as a shared cache is concerned. That is an unlimited supply
 * of guaranteed misses at the edge, each one arriving here.
 */
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

beforeEach(() => {
  renderCard.mockReset();
  renderCard.mockResolvedValue(PNG);
  getEventById.mockReset();
  getEventById.mockResolvedValue({
    event_id: 42, title: 'Weekly meeting', rso_name: 'IEEE', is_private: 0,
    start_time: '2026-10-01 19:00:00', building: 'Electrical & Computer Eng Bldg', room_number: '1002',
  });
});

describe('the address of a card', () => {
  it('draws the card for an identifier that is a number', async () => {
    const res = await request(app).get('/og/event/42.png');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(getEventById).toHaveBeenCalledWith(42);
  });

  it('refuses an identifier with anything else on the end of it', async () => {
    for (const address of ['/og/event/42abc.png', '/og/event/42.png.png', '/og/event/1.2.3.png']) {
      const res = await request(app).get(address);
      expect(res.status, address).toBe(404);
    }
    expect(getEventById).not.toHaveBeenCalled();
    expect(renderCard).not.toHaveBeenCalled();
  });

  it('refuses an identifier written with a leading zero, which is a second address for one event', async () => {
    const res = await request(app).get('/og/event/0042.png');
    expect(res.status).toBe(404);
    expect(renderCard).not.toHaveBeenCalled();
  });

  it('still answers the shared card, which carries no identifier at all', async () => {
    const res = await request(app).get('/og/card.png');
    expect(res.status).toBe(200);
    expect(renderCard).toHaveBeenCalledWith(null);
  });
});

describe('how often a card may be asked for', () => {
  it('turns a caller away once it has asked far more often than any reader would', async () => {
    const many = Number(process.env.SHARE_CARD_REQUESTS_PER_HOUR || '120');
    let refused = 0;
    for (let at = 0; at <= many + 2; at += 1) {
      const res = await request(app).get('/og/card.png').set('X-Forwarded-For', '203.0.113.9');
      if (res.status === 429) refused += 1;
    }
    expect(refused).toBeGreaterThan(0);
  }, 30000);
});
