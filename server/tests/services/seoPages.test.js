import { describe, it, expect, vi, beforeEach } from 'vitest';

const getPublicEvents = vi.fn();
const getEventById = vi.fn();
const getConfirmedMidterms = vi.fn();

vi.mock('../../db/queries/events.js', () => ({
  getPublicEvents: (...a) => getPublicEvents(...a),
  getEventById: (...a) => getEventById(...a),
}));
vi.mock('../../db/queries/midterms.js', () => ({
  getConfirmedMidterms: (...a) => getConfirmedMidterms(...a),
}));

const { describePage } = await import('../../services/seoPages.js');

const SITE = 'https://viaillinois.com';

const EVENT = {
  event_id: 12, title: 'PCB Design Workshop', description: 'Lay out a two layer board.',
  start_time: '2026-10-01 18:00:00', end_time: '2026-10-01 20:00:00',
  rso_name: 'HKN', building: 'Electrical & Computer Eng Bldg', room_number: '1002',
  location_text: null, is_private: 0,
};

describe('describePage', () => {
  beforeEach(() => {
    getPublicEvents.mockResolvedValue([EVENT]);
    getEventById.mockResolvedValue(EVENT);
    getConfirmedMidterms.mockResolvedValue([]);
  });

  describe('the front page', () => {
    it('says what the site is for, not just what it is called', async () => {
      const page = await describePage('/', SITE);
      expect(page.title).toMatch(/ECE/);
      expect(page.description.length).toBeGreaterThan(60);
      expect(page.canonical).toBe(`${SITE}/`);
    });

    /**
     * The reason event pages are not indexed: nothing links to them in the
     * HTML, so a crawler that does not run scripts never learns they exist.
     */
    it('links to every event, so a crawler can find them', async () => {
      const page = await describePage('/', SITE);
      expect(page.content).toContain('href="/events/12"');
      expect(page.content).toContain('PCB Design Workshop');
    });

    /**
     * The page calls its list upcoming events, and a crawler reads the list it
     * is given, so the list has to hold what the heading says it holds.
     */
    it('lists the events that are still to come, not the ones already held', async () => {
      await describePage('/', SITE);
      expect(getPublicEvents.mock.calls[0][0]).toMatchObject({ timeframe: 'upcoming' });
    });

    it('carries the list, the site and the organisation as structured data', async () => {
      const types = (await describePage('/', SITE)).jsonLd.map(item => item['@type']);
      expect(types).toContain('ItemList');
      expect(types).toContain('WebSite');
      expect(types).toContain('Organization');
    });
  });

  describe('an event page', () => {
    it('is titled after the event and its organiser', async () => {
      const page = await describePage('/events/12', SITE);
      expect(page.title).toContain('PCB Design Workshop');
      expect(page.title).toContain('HKN');
    });

    it('describes when and where it is, which is what a searcher wants', async () => {
      const page = await describePage('/events/12', SITE);
      expect(page.description).toMatch(/HKN/);
      expect(page.description).toMatch(/Electrical/);
    });

    it('publishes the event as structured data', async () => {
      const page = await describePage('/events/12', SITE);
      expect(page.jsonLd[0]).toMatchObject({ '@type': 'Event', name: 'PCB Design Workshop' });
    });

    it('renders the event as readable HTML for anything that does not run scripts', async () => {
      const page = await describePage('/events/12', SITE);
      expect(page.content).toContain('<h1>');
      expect(page.content).toContain('PCB Design Workshop');
      expect(page.content).toContain('<time');
    });

    /** An internal event is not for the public and must not be indexed. */
    it('keeps a private event out of the index', async () => {
      getEventById.mockResolvedValue({ ...EVENT, is_private: 1 });
      const page = await describePage('/events/12', SITE);
      expect(page.robots).toMatch(/noindex/);
      expect(page.content).toBeUndefined();
    });

    it('keeps an event that does not exist out of the index', async () => {
      getEventById.mockResolvedValue(null);
      expect((await describePage('/events/999', SITE)).robots).toMatch(/noindex/);
    });

    it('escapes nothing itself, leaving that to the renderer', async () => {
      getEventById.mockResolvedValue({ ...EVENT, title: 'A & B' });
      expect((await describePage('/events/12', SITE)).title).toContain('A & B');
    });
  });

  describe('pages that should never be indexed', () => {
    it.each(['/dashboard', '/admin', '/login', '/scheduler', '/poster'])('keeps %s out', async (path) => {
      expect((await describePage(path, SITE)).robots).toMatch(/noindex/);
    });
  });

  describe('other public pages', () => {
    it('describes the midterm listing', async () => {
      const page = await describePage('/midterms', SITE);
      expect(page.title).toMatch(/[Mm]idterm/);
      expect(page.canonical).toBe(`${SITE}/midterms`);
    });

    it('describes the calendar', async () => {
      expect((await describePage('/calendar', SITE)).title).toMatch(/[Cc]alendar/);
    });

    it('describes the about page', async () => {
      expect((await describePage('/about', SITE)).title).toMatch(/[Aa]bout/);
    });
  });

  it('gives an unknown address the site defaults rather than failing', async () => {
    const page = await describePage('/nothing-here', SITE);
    expect(page.title).toBeTruthy();
    expect(page.robots).toMatch(/noindex/);
  });

  it('survives the database being unavailable, because a slow page beats no page', async () => {
    getPublicEvents.mockRejectedValue(new Error('database is down'));
    const page = await describePage('/', SITE);
    expect(page.title).toBeTruthy();
    expect(page.content).toBeUndefined();
  });
});
