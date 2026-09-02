import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../db/queries/events.js', () => ({
  getPublicEvents: vi.fn().mockResolvedValue([]),
  getAllEvents: vi.fn().mockResolvedValue([]),
  getVisibleEvents: vi.fn().mockResolvedValue([]),
  getKioskEvents: vi.fn().mockResolvedValue([]),
  getPublicEventSitemapEntries: vi.fn().mockResolvedValue([]),
  getEventById: vi.fn(), createEvent: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn(),
  findEventsByUid: vi.fn().mockResolvedValue([]),
  countPublicEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  countAllEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  countVisibleEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  TIMEFRAMES: ['upcoming', 'archived', 'all'],
}));
vi.mock('../../db/queries/midterms.js', () => ({
  getConfirmedMidterms: vi.fn().mockResolvedValue([]),
  getAllMidterms: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../db/queries/rso.js', () => ({
  getMembership: vi.fn(), getUserMemberships: vi.fn().mockResolvedValue([]),
  getAllRsos: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

const app = (await import('../../app.js')).default;
const { signToken } = await import('../../middleware/auth.js');

const cacheControlOf = res => res.headers['cache-control'];

/**
 * The site sits behind a CDN. What the edge may keep, and for how long, is the
 * difference between a page that is drawn from Champaign and one that is drawn
 * from wherever the reader is.
 */
describe('what the API says about caching', () => {
  it('keeps the feed out of shared caches, because it depends on who is asking', async () => {
    const res = await request(app).get('/api/v1/events');
    expect(cacheControlOf(res)).toBe('private, no-store');
  });

  it('keeps a signed in reader out of shared caches too', async () => {
    const res = await request(app).get('/api/v1/events')
      .set('Cookie', `via_token=${signToken({ net_id: 'member' })}`);
    expect(cacheControlOf(res)).toBe('private, no-store');
  });

  /**
   * The kiosk endpoint answers the same thing to everyone, and a lobby screen
   * asks for it over and over, which is exactly what an edge cache is for.
   */
  it('lets the edge answer the kiosk', async () => {
    const res = await request(app).get('/api/v1/kiosk/events');
    expect(cacheControlOf(res)).toMatch(/^public/);
    expect(cacheControlOf(res)).toMatch(/s-maxage=\d+/);
  });

  it('lets the edge answer the term calendar for longer, because it changes once a year', async () => {
    const res = await request(app).get('/api/v1/semester/current');
    const value = cacheControlOf(res);
    expect(value).toMatch(/^public/);
    expect(Number(/s-maxage=(\d+)/.exec(value)[1])).toBeGreaterThanOrEqual(3600);
  });

  it('lets the edge answer what crawlers read', async () => {
    for (const path of ['/robots.txt', '/sitemap.xml', '/llms.txt']) {
      const res = await request(app).get(path);
      expect(cacheControlOf(res), path).toMatch(/^public/);
    }
  });
});

/**
 * The CDN fetches from Champaign compressed if the origin offers it, and every
 * cache miss then travels a fraction of the bytes. A feed page is mostly
 * repeated field names, which is the shape gzip is best at.
 */
describe('what the API sends over the wire', () => {
  it('compresses a response worth compressing', async () => {
    const { getPublicEvents } = await import('../../db/queries/events.js');
    getPublicEvents.mockResolvedValueOnce(Array.from({ length: 40 }, (_, i) => ({
      event_id: i, title: `PCB Design Workshop ${i}`,
      description: 'Lay out a two layer board with us, no experience needed.',
      start_time: '2026-10-01 18:00:00', end_time: '2026-10-01 20:00:00',
      rso_name: 'HKN', building: 'Electrical & Computer Eng Bldg', room_number: '1002',
      location_text: null, is_private: 0, tags: 'Workshop, Free Food',
    })));

    const res = await request(app).get('/api/v1/events').set('Accept-Encoding', 'gzip');
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.body.events).toHaveLength(40);
  });

  it('leaves a response alone for a client that did not ask for compression', async () => {
    const res = await request(app).get('/api/v1/events').set('Accept-Encoding', 'identity');
    expect(res.headers['content-encoding']).toBeUndefined();
  });
});
