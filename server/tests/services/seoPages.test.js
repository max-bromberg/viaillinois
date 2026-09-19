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

const getPublicOrganizations = vi.fn();
const getPublicOrganization = vi.fn();
const getPublicEventsForRso = vi.fn();

vi.mock('../../db/queries/rso.js', () => ({
  getPublicOrganizations: (...a) => getPublicOrganizations(...a),
  getPublicOrganization: (...a) => getPublicOrganization(...a),
  getPublicEventsForRso: (...a) => getPublicEventsForRso(...a),
}));

const { describePage } = await import('../../services/seoPages.js');

const SITE = 'https://viaillinois.com';

const EVENT = {
  event_id: 12, title: 'PCB Design Workshop', description: 'Lay out a two layer board.',
  start_time: '2026-10-01 18:00:00', end_time: '2026-10-01 20:00:00',
  rso_name: 'HKN', building: 'Electrical & Computer Eng Bldg', room_number: '1002',
  location_text: null, is_private: 0,
};

const ORGANIZATION = {
  rso_id: 7, name: 'HKN', description: 'The engineering honour society at Illinois.',
  founded_year: 1904, logo_color: '#b5306f',
  event_count: 12, upcoming_count: 3, last_change: '2026-09-18 10:00:00',
};

describe('describePage', () => {
  beforeEach(() => {
    getPublicEvents.mockResolvedValue([EVENT]);
    getEventById.mockResolvedValue(EVENT);
    getConfirmedMidterms.mockResolvedValue([]);
    getPublicOrganizations.mockResolvedValue([ORGANIZATION]);
    getPublicOrganization.mockResolvedValue(ORGANIZATION);
    getPublicEventsForRso.mockResolvedValue({ upcoming: [EVENT], past: [] });
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

    it('carries a cancellation into the structured data the page publishes', async () => {
      getEventById.mockResolvedValue({ ...EVENT, cancelled_at: '2026-09-20 09:00:00' });
      const page = await describePage('/events/12', SITE);
      expect(page.jsonLd[0].eventStatus).toBe('https://schema.org/EventCancelled');
    });

    it('carries a cancellation into the listing on the front page too', async () => {
      getPublicEvents.mockResolvedValue([{ ...EVENT, cancelled_at: '2026-09-20 09:00:00' }]);
      const page = await describePage('/', SITE);
      expect(page.jsonLd[0].itemListElement[0].item.eventStatus)
        .toBe('https://schema.org/EventCancelled');
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

/**
 * The pages for the organizations themselves.
 *
 * VIA had no page for an organization at all, which cost it three things at
 * once. Google asks every event listing for a url on its organizer and there
 * was nothing to point at. Twenty organizations, each with a description and a
 * run of events, were twenty pages of real content the site was not
 * publishing. And every event page was reachable from exactly one place, the
 * front page, which is thin linking for a site whose event pages Google has
 * discovered and declined to crawl.
 */
describe('the organizations', () => {
  beforeEach(() => {
    getPublicOrganizations.mockResolvedValue([ORGANIZATION]);
    getPublicOrganization.mockResolvedValue(ORGANIZATION);
    getPublicEventsForRso.mockResolvedValue({ upcoming: [EVENT], past: [] });
  });

  describe('the page listing all of them', () => {
    it('is indexable and says what it lists', async () => {
      const page = await describePage('/organizations', SITE);
      expect(page.robots).toBe('index, follow');
      expect(page.canonical).toBe(`${SITE}/organizations`);
      expect(page.title).toMatch(/organization/i);
      expect(page.description.length).toBeGreaterThan(60);
    });

    it('links to every organization, so a crawler can find them all from here', async () => {
      const page = await describePage('/organizations', SITE);
      expect(page.content).toContain('href="/organizations/7"');
      expect(page.content).toContain('HKN');
    });
  });

  describe('the page for one of them', () => {
    it('names the organization in the title and the description', async () => {
      const page = await describePage('/organizations/7', SITE);
      expect(page.title).toMatch(/^HKN/);
      expect(page.description).toContain('HKN');
      expect(page.canonical).toBe(`${SITE}/organizations/7`);
      expect(page.robots).toBe('index, follow');
    });

    it('links to each of its events, which is a second way into every event page', async () => {
      const page = await describePage('/organizations/7', SITE);
      expect(page.content).toContain('href="/events/12"');
      expect(page.content).toContain('PCB Design Workshop');
    });

    /** What the organization is, in its own words, is the page's own content. */
    it('carries what the organization says about itself', async () => {
      const page = await describePage('/organizations/7', SITE);
      expect(page.content).toContain('The engineering honour society at Illinois.');
    });

    it('describes itself to a machine as an organization with a list of events', async () => {
      const page = await describePage('/organizations/7', SITE);
      const kinds = page.jsonLd.map(item => item['@type']);
      expect(kinds).toContain('Organization');
      expect(kinds).toContain('ItemList');
      const organization = page.jsonLd.find(item => item['@type'] === 'Organization');
      expect(organization.name).toBe('HKN');
      expect(organization.url).toBe(`${SITE}/organizations/7`);
      expect(organization.foundingDate).toBe('1904');
    });

    /**
     * An organization with nothing public is a page with nothing on it, which
     * is the thin content a search engine discovers and then declines to keep.
     */
    it('is not offered to a search engine where there is no such organization', async () => {
      getPublicOrganization.mockResolvedValue(null);
      const page = await describePage('/organizations/99', SITE);
      expect(page.robots).toBe('noindex, nofollow');
      expect(page.content).toBeUndefined();
    });
  });
});

/**
 * Two addresses were falling past every case and being told not to index
 * themselves: the page for one platform update, and each tab of About. Both
 * are ordinary reading pages with an address of their own, and both were
 * serving the fallback, which carries the site title, no canonical address and
 * noindex. That is at least part of what Search Console is reporting as pages
 * with no canonical the site chose.
 */
describe('the reading pages that were falling through', () => {
  it('lets one platform update be indexed, under its own address', async () => {
    const page = await describePage('/updates/2026-04-23-welcome', SITE);
    expect(page.robots).toBe('index, follow');
    expect(page.canonical).toBe(`${SITE}/updates/2026-04-23-welcome`);
  });

  it('points a tab of About at About itself, because it is the same page', async () => {
    const page = await describePage('/about/updates', SITE);
    expect(page.canonical).toBe(`${SITE}/about`);
    expect(page.robots).toBe('index, follow');
  });

  /** Everything else still says no, which is what an address nobody planned for is. */
  it('still declines an address nobody planned for', async () => {
    const page = await describePage('/nothing/like/this', SITE);
    expect(page.robots).toBe('noindex, nofollow');
  });
});

/**
 * A page VIA could not describe, because it could not ask.
 *
 * Every builder here wrapped its query in a catch and carried on, and the
 * event and organization builders treated "no row" and "could not ask" as the
 * same answer: the page does not exist, so tell search engines not to keep it.
 * A minute of the database being away therefore served noindex for every event
 * on the site, and noindex is the one instruction Google acts on immediately
 * and takes weeks to undo.
 *
 * Not knowing is not the same as knowing there is nothing. A page whose lookup
 * failed says so, the shell answers 503, and a crawler comes back.
 */
describe('a page whose lookup failed', () => {
  it('does not tell a search engine the event is gone', async () => {
    getEventById.mockRejectedValue(new Error('the database is away'));
    const page = await describePage('/events/12', SITE);
    expect(page.robots).not.toBe('noindex, nofollow');
    expect(page.unavailable).toBe(true);
  });

  it('does not tell a search engine the organization is gone', async () => {
    getPublicOrganization.mockRejectedValue(new Error('the database is away'));
    const page = await describePage('/organizations/7', SITE);
    expect(page.robots).not.toBe('noindex, nofollow');
    expect(page.unavailable).toBe(true);
  });

  /** An event that genuinely is not there is still told apart from one VIA could not ask about. */
  it('still declines an event that is really not there', async () => {
    getEventById.mockResolvedValue(null);
    const page = await describePage('/events/12', SITE);
    expect(page.robots).toBe('noindex, nofollow');
    expect(page.unavailable).toBeUndefined();
  });

  it('still declines an organization that has nothing public', async () => {
    getPublicOrganization.mockResolvedValue(null);
    const page = await describePage('/organizations/7', SITE);
    expect(page.robots).toBe('noindex, nofollow');
    expect(page.unavailable).toBeUndefined();
  });

  /**
   * The front page and the listings carry on with an empty list rather than
   * refusing: a page with a heading and nothing under it is still a page, and
   * it is the site's most linked to address.
   */
  it('still serves the front page with nothing on it', async () => {
    getPublicEvents.mockRejectedValue(new Error('the database is away'));
    const page = await describePage('/', SITE);
    expect(page.robots).toBe('index, follow');
    expect(page.unavailable).toBeUndefined();
  });
});

/**
 * An address under /updates that no update was ever written for.
 *
 * The builder above lets one platform update be indexed under its own address,
 * and it was doing that for any address of that shape at all, with a canonical
 * address pointing at itself. The client knows which updates exist, because it
 * builds them out of the markdown, and the server did not, so anybody could
 * hand a crawler /updates/anything-they-liked and VIA would answer that it was
 * a real page worth keeping. That is the thin content this whole work package
 * set out to stop serving, arriving by another door.
 */
describe('an update that was never written', () => {
  it('is not offered to a search engine as a page of its own', async () => {
    const page = await describePage('/updates/nothing-was-ever-written-here', SITE);
    expect(page.robots).toBe('noindex, nofollow');
  });

  it('does not claim to be its own canonical address', async () => {
    const page = await describePage('/updates/nothing-was-ever-written-here', SITE);
    expect(page.canonical).toBeUndefined();
  });

  /** The updates that were written are still indexed, which is the point of the case. */
  it('leaves a real update indexed under its own address', async () => {
    const page = await describePage('/updates/2026-04-23-welcome', SITE);
    expect(page.robots).toBe('index, follow');
    expect(page.canonical).toBe(`${SITE}/updates/2026-04-23-welcome`);
  });

  /**
   * An address arrives as it was requested, so a slug can carry anything that
   * survives a URL. A stray percent sign is not a valid escape, and reading
   * one has to be a page declining to be indexed rather than a thrown error.
   */
  it('declines an address that cannot be read rather than failing on it', async () => {
    const page = await describePage('/updates/%', SITE);
    expect(page.robots).toBe('noindex, nofollow');
  });
});

/**
 * The listing of organizations, when VIA could not ask for it.
 *
 * The event and organization builders tell "no row" apart from "could not
 * ask", and this one did not: a failed query became an empty list, and an
 * empty list was served as an indexable page headed "Every ECE student
 * organization" with nothing under it. That is the same fault the rest of this
 * work package fixed, on the one page whose whole purpose is to be a route
 * into every other one.
 */
describe('the organizations listing whose lookup failed', () => {
  it('does not serve an indexable page saying there are none', async () => {
    getPublicOrganizations.mockRejectedValue(new Error('the database is away'));
    const page = await describePage('/organizations', SITE);
    expect(page.unavailable).toBe(true);
  });

  /** An organization list that really is empty is a different answer. */
  it('still serves the listing when there genuinely are none', async () => {
    getPublicOrganizations.mockResolvedValue([]);
    const page = await describePage('/organizations', SITE);
    expect(page.robots).toBe('index, follow');
    expect(page.unavailable).toBeUndefined();
  });
});
