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
const getPublicOrganizations = vi.fn();
vi.mock('../../db/queries/rso.js', () => ({
  getMembership: vi.fn(), getUserMemberships: vi.fn(),
  getPublicOrganizations: (...a) => getPublicOrganizations(...a),
  getPublicOrganization: vi.fn().mockResolvedValue(null),
  getPublicEventsForRso: vi.fn().mockResolvedValue({ upcoming: [], past: [] }),
}));
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
    getPublicOrganizations.mockResolvedValue([
      { rso_id: 7, name: 'HKN', last_change: '2026-09-18 10:00:00' },
    ]);
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

/**
 * What else belongs in a sitemap.
 *
 * A sitemap is the one place VIA gets to say, in full, which of its addresses
 * are worth a search engine's time. It listed seven fixed pages and the
 * events, so the organizations and the platform updates, each of which is a
 * page written to be read, were never submitted at all.
 */
describe('everything the sitemap carries', () => {
  beforeEach(() => {
    getPublicEventSitemapEntries.mockResolvedValue([
      { event_id: 12, updated_at: '2026-09-18 10:00:00' },
    ]);
    getPublicOrganizations.mockResolvedValue([
      { rso_id: 7, name: 'HKN', last_change: '2026-09-18 10:00:00' },
      { rso_id: 8, name: 'IEEE', last_change: null },
    ]);
  });

  it('lists the page holding every organization, and one per organization', async () => {
    const { text } = await request(app).get('/sitemap.xml');
    expect(text).toContain('<loc>http://viaillinois.test/organizations</loc>');
    expect(text).toContain('<loc>http://viaillinois.test/organizations/7</loc>');
    expect(text).toContain('<loc>http://viaillinois.test/organizations/8</loc>');
  });

  /**
   * lastmod was the hour the event starts at, so every event still to come
   * claimed to have been modified in the future. Google uses lastmod only
   * where it is consistently accurate, and one date it cannot believe is
   * enough for it to stop believing any of them.
   */
  /** The one <url> block holding an address, rather than whatever follows it. */
  const entryFor = (text, path) => [...text.matchAll(/<url>[\s\S]*?<\/url>/g)]
    .map(match => match[0])
    .find(block => block.includes(`${path}</loc>`));

  it('says when a page last changed, never when its event is due to happen', async () => {
    const { text } = await request(app).get('/sitemap.xml');
    expect(entryFor(text, '/events/12')).toContain('<lastmod>2026-09-18T10:00:00-05:00</lastmod>');
  });

  it('leaves lastmod off a page it does not know the date of', async () => {
    const { text } = await request(app).get('/sitemap.xml');
    expect(entryFor(text, '/organizations/8')).not.toContain('<lastmod>');
    expect(entryFor(text, '/organizations/7')).toContain('<lastmod>');
  });

  it('holds every address exactly once', async () => {
    const { text } = await request(app).get('/sitemap.xml');
    const found = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
    expect(found.length).toBe(new Set(found).size);
  });

  /** A sitemap that carries on without the organizations still lists the events. */
  it('still answers where the organizations cannot be read', async () => {
    getPublicOrganizations.mockRejectedValue(new Error('the database is away'));
    const { status, text } = await request(app).get('/sitemap.xml');
    expect(status).toBe(200);
    expect(text).toContain('/events/12');
  });
});

describe('what robots.txt and llms.txt tell a crawler', () => {
  it('sends a crawler to the organizations as well as to the events', async () => {
    const { text } = await request(app).get('/llms.txt');
    expect(text).toContain('/organizations');
  });

  /**
   * The poster designer and the scheduler are board tools behind a sign in,
   * and the addresses that open them carry an event identifier, so a crawler
   * following one asks the database for something it will never be shown.
   */
  it('keeps crawlers out of the signed in areas', async () => {
    const { text } = await request(app).get('/robots.txt');
    for (const path of ['/dashboard', '/admin', '/login', '/scheduler', '/poster', '/api/']) {
      expect(text).toContain(`Disallow: ${path}`);
    }
  });
});
