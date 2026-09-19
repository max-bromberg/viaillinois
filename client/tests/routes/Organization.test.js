import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';

const getRso = vi.hoisted(() => vi.fn());
const getRsos = vi.hoisted(() => vi.fn());
const getEvents = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/rsos.js', () => ({ getRso, getRsos }));
vi.mock('../../src/api/events.js', () => ({ getEvents }));
vi.mock('../../src/lib/router.js', async importOriginal => ({
  ...await importOriginal(), navigate,
}));

const Organization = (await import('../../src/routes/Organization.svelte')).default;
const Organizations = (await import('../../src/routes/Organizations.svelte')).default;

const RSO = {
  rso_id: 7,
  rso_name: 'HKN',
  description: 'The engineering honour society at Illinois.',
  founded_year: 1904,
  logo_color: '#b5306f',
};

const UPCOMING = {
  event_id: 12,
  title: 'PCB Design Workshop',
  start_time: '2027-10-01T18:00:00-05:00',
  end_time: '2027-10-01T20:00:00-05:00',
  rso_id: 7,
  rso_name: 'HKN',
  building: 'Electrical & Computer Eng Bldg',
  room_number: '1002',
};

const PAST = { ...UPCOMING, event_id: 9, title: 'Resume workshop', start_time: '2024-02-01T18:00:00-06:00', end_time: '2024-02-01T19:00:00-06:00' };

beforeEach(() => {
  vi.clearAllMocks();
  getRso.mockResolvedValue({ rso: RSO });
  getRsos.mockResolvedValue({ rsos: [{ ...RSO, name: 'HKN' }] });
  getEvents.mockImplementation(filters => Promise.resolve(
    filters?.timeframe === 'archived' ? { events: [PAST] } : { events: [UPCOMING] },
  ));
});

/**
 * The page for one student organization.
 *
 * VIA had no page for an organization at all, which cost it three things at
 * once. Google asks every event listing for an address on its organizer and
 * there was nothing to point at. Twenty organizations, each with a description
 * and a run of events, were twenty pages of real writing the site was not
 * publishing. And an event page was reachable from exactly one place, the
 * front page, which is thin linking for a site whose event pages Google has
 * discovered and declined to crawl.
 */
describe('the page for one organization', () => {
  it('names the organization as the page title', async () => {
    const { getByRole } = render(Organization, { id: 7 });
    await waitFor(() => expect(getByRole('heading', { level: 1, name: 'HKN' })).toBeTruthy());
  });

  it('says what the organization is, in its own words', async () => {
    const { findByText } = render(Organization, { id: 7 });
    expect(await findByText('The engineering honour society at Illinois.')).toBeTruthy();
  });

  it('says when it was founded, where VIA knows', async () => {
    const { findByText } = render(Organization, { id: 7 });
    expect(await findByText(/1904/)).toBeTruthy();
  });

  it('lists what it has coming up, and what it did recently', async () => {
    const { findByText } = render(Organization, { id: 7 });
    expect(await findByText('PCB Design Workshop')).toBeTruthy();
    expect(await findByText('Resume workshop')).toBeTruthy();
  });

  it('asks for that organization only, on both sides of today', async () => {
    render(Organization, { id: 7 });
    await waitFor(() => expect(getEvents).toHaveBeenCalledTimes(2));
    for (const [filters] of getEvents.mock.calls) {
      expect(filters.rsoIds).toEqual([7]);
      expect(filters.excludePrivate).toBe(true);
    }
    expect(getEvents.mock.calls.map(([f]) => f.timeframe).sort())
      .toEqual(['archived', 'upcoming']);
  });

  it('says so plainly where there is no such organization', async () => {
    getRso.mockRejectedValue(new Error('not found'));
    const { findByRole } = render(Organization, { id: 99 });
    expect(await findByRole('heading', { level: 1, name: /no organization/i })).toBeTruthy();
  });

  it('offers the way back to every organization', async () => {
    const { findByRole } = render(Organization, { id: 7 });
    expect(await findByRole('link', { name: /every ece student organization/i })).toBeTruthy();
  });
});

describe('the page listing every organization', () => {
  it('heads itself with what it lists', async () => {
    const { getByRole } = render(Organizations);
    await waitFor(() => expect(
      getByRole('heading', { level: 1, name: /student organizations/i }),
    ).toBeTruthy());
  });

  it('links to each organization by name', async () => {
    const { findByRole } = render(Organizations);
    const link = await findByRole('link', { name: /HKN/ });
    expect(link.getAttribute('href')).toBe('/organizations/7');
  });

  it('says so where nothing could be read', async () => {
    getRsos.mockRejectedValue(new Error('the database is away'));
    const { findByText } = render(Organizations);
    expect(await findByText(/could not be loaded/i)).toBeTruthy();
  });
});
