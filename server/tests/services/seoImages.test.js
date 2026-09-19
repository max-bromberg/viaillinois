import { describe, it, expect, vi, beforeEach } from 'vitest';

const getEventById = vi.hoisted(() => vi.fn());
const getPublicEvents = vi.hoisted(() => vi.fn());
const getConfirmedMidterms = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/events.js', () => ({ getEventById, getPublicEvents }));
vi.mock('../../db/queries/midterms.js', () => ({ getConfirmedMidterms }));

const { describePage: pageFor } = await import('../../services/seoPages.js');

const SITE = 'https://viaillinois.com';

beforeEach(() => {
  vi.clearAllMocks();
  getPublicEvents.mockResolvedValue([]);
  getConfirmedMidterms.mockResolvedValue([]);
  getEventById.mockResolvedValue({
    event_id: 42, title: 'Resume Review Night', rso_name: 'IEEE', is_private: 0,
    start_time: '2026-09-20 18:00:00', building: 'Electrical & Computer Eng Bldg', room_number: '1002',
  });
});

/**
 * Every page set no image at all.
 *
 * The renderer only writes og:image when a page names one, and no page ever
 * did, so the picture in public/ was referenced by nothing and a shared VIA
 * link arrived with no picture on it whatsoever. That is the whole of why the
 * card looked wrong: there was not one.
 */
describe('the picture a page is shared with', () => {
  it('is the event\'s own card on an event page', async () => {
    const page = await pageFor('/events/42', SITE);
    expect(page.image).toBe(`${SITE}/og/event/42.png`);
    expect(page.imageAlt).toContain('Resume Review Night');
  });

  it('is the shared card on the front page', async () => {
    const page = await pageFor('/', SITE);
    expect(page.image).toBe(`${SITE}/og/card.png`);
  });

  it('is the shared card on the midterm schedule', async () => {
    const page = await pageFor('/midterms', SITE);
    expect(page.image).toBe(`${SITE}/og/card.png`);
  });

  it('is the shared card on a page the platform simply has', async () => {
    const page = await pageFor('/about', SITE);
    expect(page.image).toBe(`${SITE}/og/card.png`);
  });

  /**
   * An event nobody outside the organization may see is not given a card of
   * its own, because the address of that card would be a way to read its title.
   */
  it('is the shared card for an internal event', async () => {
    getEventById.mockResolvedValue({ event_id: 42, title: 'Board Sync', is_private: 1 });
    const page = await pageFor('/events/42', SITE);
    expect(page.image).toBe(`${SITE}/og/card.png`);
    expect(page.imageAlt ?? '').not.toContain('Board Sync');
  });

  it('is the shared card for an event that is not there', async () => {
    getEventById.mockResolvedValue(null);
    const page = await pageFor('/events/999', SITE);
    expect(page.image).toBe(`${SITE}/og/card.png`);
  });
});
