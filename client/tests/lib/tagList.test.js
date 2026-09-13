import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';

const getTags = vi.hoisted(() => vi.fn());
vi.mock('../../src/api/tags.js', () => ({
  getTags, createTag: vi.fn(), deleteTag: vi.fn(),
}));
vi.mock('../../src/api/venues.js', () => ({ searchVenues: vi.fn().mockResolvedValue({ venues: [] }) }));
vi.mock('../../src/api/locations.js', () => ({ searchLocations: vi.fn().mockResolvedValue({ locations: [] }) }));

const EventForm = (await import('../../src/lib/EventForm.svelte')).default;
const FilterRail = (await import('../../src/lib/FilterRail.svelte')).default;

beforeEach(() => {
  vi.clearAllMocks();
  getTags.mockResolvedValue({ tags: [{ tag_name: 'Hackathon', events: 0 }, { tag_name: 'Workshop', events: 4 }] });
});

/**
 * The tags a board may put on an event were written into two components, so
 * adding one meant a release. Both now read the list the admin page keeps: the
 * event form and the filter rail, which replaced the filter panel.
 */
describe('the tag list, wherever tags are offered', () => {
  it('the event form offers the tags the platform holds', async () => {
    const { findByRole, queryByRole } = render(EventForm, { props: { rsoId: 1 } });
    expect(await findByRole('button', { name: 'Hackathon' })).toBeTruthy();
    await waitFor(() => expect(queryByRole('button', { name: 'Free Food' })).toBeNull());
  });

  it('the filter rail offers the same list', async () => {
    const { findByRole } = render(FilterRail, { props: { rsos: [] } });
    expect(await findByRole('button', { name: 'Hackathon' })).toBeTruthy();
  });

});
