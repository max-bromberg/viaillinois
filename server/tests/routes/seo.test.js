import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getPublicEventSitemapEntries = vi.fn();

vi.mock('../../db/queries/events.js', () => ({
  getPublicEventSitemapEntries: (...a) => getPublicEventSitemapEntries(...a),
  getPublicEvents: vi.fn().mockResolvedValue([]),
  getEventById: vi.fn(), countPublicEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  countAllEvents: vi.fn().mockResolvedValue([{ total: 0 }]), updateEvent: vi.fn(),
  deleteEvent: vi.fn(), findEventsByUid: vi.fn(), createEvent: vi.fn(),
}));
vi.mock('../../db/queries/advanced.js', () => ({ createEventTransactional: vi.fn(), callGetRSOStats: vi.fn() }));
vi.mock('../../db/queries/rso.js', () => ({ getMembership: vi.fn(), getUserMemberships: vi.fn() }));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(), inviteUser: vi.fn(),
}));
vi.mock('../../db/queries/midterms.js', () => ({ getConfirmedMidterms: vi.fn().mockResolvedValue([]) }));

// The canonical host comes from configuration rather than from the request,
// so that a spoofed Host header cannot put someone else's domain into the
// sitemap or a canonical tag.
process.env.CLIENT_URL = 'http://viaillinois.test';
const app = (await import('../../app.js')).default;

const EVENT = {
  event_id: 12, title: 'PCB Design Workshop', start_time: '2026-10-01 18:00:00',
  end_time: '2026-10-01 20:00:00', is_private: 0,
};

describe('GET /sitemap.xml', () => {
  beforeEach(() => {
    getPublicEventSitemapEntries.mockResolvedValue([EVENT, { ...EVENT, event_id: 13 }]);
  });

  /**
   * The sitemap protocol requires absolute addresses. The file this replaces
   * listed relative ones, so every entry in it was rejected and none of the
   * pages were ever submitted.
   */
  it('lists absolute addresses', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    for (const loc of res.text.match(/<loc>([^<]*)<\/loc>/g)) {
      expect(loc).toMatch(/<loc>https?:\/\//);
    }
  });

  it('includes a page for every public event', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.text).toContain('/events/12');
    expect(res.text).toContain('/events/13');
  });

  it('includes the pages that are not events', async () => {
    const res = await request(app).get('/sitemap.xml');
    for (const path of ['/', '/calendar', '/midterms', '/about']) {
      expect(res.text).toContain(`<loc>http://viaillinois.test${path}</loc>`);
    }
  });

  it('escapes anything that would break the document', async () => {
    getPublicEventSitemapEntries.mockResolvedValue([{ ...EVENT, event_id: 14 }]);
    const res = await request(app).get('/sitemap.xml');
    expect(res.text).not.toContain('&&');
  });

  it('still returns the fixed pages when the database is unavailable', async () => {
    getPublicEventSitemapEntries.mockRejectedValue(new Error('database is down'));
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<loc>http://viaillinois.test/</loc>');
  });
});

describe('GET /robots.txt', () => {
  it('points at the sitemap with an absolute address', async () => {
    const res = await request(app).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
  });

  it('keeps crawlers out of the signed in areas', async () => {
    const res = await request(app).get('/robots.txt');
    expect(res.text).toContain('Disallow: /dashboard');
    expect(res.text).toContain('Disallow: /admin');
  });

  /** Assistants send their own crawlers, and they are welcome here. */
  it('welcomes the crawlers behind assistants by name', async () => {
    const res = await request(app).get('/robots.txt');
    for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) {
      expect(res.text).toContain(bot);
    }
  });
});

describe('GET /llms.txt', () => {
  it('describes the site in the form assistants look for', async () => {
    const res = await request(app).get('/llms.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/^# VIA/m);
    expect(res.text).toMatch(/University of Illinois/);
    expect(res.text).toContain('/sitemap.xml');
  });
});
