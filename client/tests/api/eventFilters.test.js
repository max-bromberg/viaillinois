import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiFetch = vi.hoisted(() => vi.fn().mockResolvedValue({ events: [], total: 0 }));
vi.mock('../../src/api/base.js', () => ({ apiFetch }));

const { getEvents } = await import('../../src/api/events.js');

const urlFor = () => apiFetch.mock.calls.at(-1)[0];

beforeEach(() => apiFetch.mockClear());

/**
 * The filter panel is answered by the server now, so these two have to reach
 * it. Before this they were applied in the browser, which meant the feed asked
 * for every matching event first and then threw most of them away.
 */
describe('getEvents filter parameters', () => {
  it('sends the chosen RSOs as one comma separated value', async () => {
    await getEvents({ rsoIds: [1, 3] });
    expect(urlFor()).toContain('rsoIds=1%2C3');
  });

  it('sends nothing at all when no RSO is chosen', async () => {
    await getEvents({ rsoIds: [] });
    expect(urlFor()).not.toContain('rsoIds');
  });

  it('asks for private events to be left out only when they should be', async () => {
    await getEvents({ excludePrivate: true });
    expect(urlFor()).toContain('excludePrivate=true');
    await getEvents({ excludePrivate: false });
    expect(urlFor()).not.toContain('excludePrivate');
  });

  it('still sends an offset of zero, which is the first page', async () => {
    await getEvents({ limit: 18, offset: 0 });
    expect(urlFor()).toContain('offset=0');
  });
});
