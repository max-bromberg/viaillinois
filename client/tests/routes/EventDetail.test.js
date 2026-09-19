import { describe, it, expect, vi } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/svelte';
import EventDetail from '../../src/routes/EventDetail.svelte';

vi.mock('../../src/api/events.js', () => ({
  getEvent: vi.fn().mockResolvedValue({
    event: {
      event_id: 1,
      rso_id: 2,
      title: 'IEEE Workshop',
      description: 'Learn **PCB design** with us.',
      start_time: '2026-04-20T18:00:00',
      end_time:   '2026-04-20T20:00:00',
      is_private: false,
      rso_name: 'IEEE UIUC',
      building: 'ECEB',
      room_number: '1002',
      max_capacity: 40,
      tags: 'Workshop, Free Food',
    },
  }),
}));

vi.mock('../../src/api/rsos.js', () => ({
  getRso: vi.fn().mockResolvedValue({
    rso: {
      rso_id: 2,
      rso_name: 'IEEE UIUC',
      description: 'Advancing technology for humanity.',
      logo_color: '#006EB6',
      founded_year: 2005,
      event_count: 12,
      members: [],
    },
  }),
}));

vi.mock('../../src/stores/auth.js', () => ({
  currentUser: { subscribe: (fn) => { fn(null); return () => {}; } },
}));

vi.mock('../../src/stores/ui.js', async importOriginal => ({ ...await importOriginal(), showToast: vi.fn() }));

vi.mock('../../src/lib/router.js', () => ({
  navigate: vi.fn(),
  currentPath: { subscribe: (fn) => { fn('/events/1'); return () => {}; } },
  routeParams: { subscribe: (fn) => { fn({ id: '1' }); return () => {}; } },
  matchRoute: vi.fn().mockReturnValue({ name: 'event-detail', params: { id: '1' } }),
}));

describe('EventDetail', () => {
  it('renders event title after loading', async () => {
    const { getByRole } = render(EventDetail, { id: 1 });
    await waitFor(() => {
      expect(getByRole('heading', { name: 'IEEE Workshop' })).toBeTruthy();
    });
  });

  it('renders location', async () => {
    const { getByText } = render(EventDetail, { id: 1 });
    await waitFor(() => {
      expect(getByText(/ECEB 1002/)).toBeTruthy();
    });
  });

  /**
   * RSVPs are gone, so the page no longer holds a card asking the reader to
   * sign in to say whether they are going.
   */
  it('shows no RSVP card', async () => {
    const { container, findByRole } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    expect(container.textContent).not.toMatch(/RSVP/i);
    expect(container.textContent).not.toMatch(/who's going/i);
  });
});

/**
 * Event detail was missed when the location became optional, so an event held
 * somewhere that is not a room rendered a bare pin with nothing beside it.
 */
describe('EventDetail location', () => {
  const base = {
    event_id: 1, rso_id: 2, title: 'IEEE Workshop', description: 'Something',
    start_time: '2026-04-20T18:00:00', end_time: '2026-04-20T20:00:00',
    is_private: false, rso_name: 'IEEE UIUC',
    building: null, room_number: null, location_text: null,
  };

  it('shows the free text when there is no room', async () => {
    const { getEvent } = await import('../../src/api/events.js');
    getEvent.mockResolvedValueOnce({ event: { ...base, location_text: 'Zoom' } });
    const { findByText } = render(EventDetail, { id: '1' });
    expect(await findByText(/Zoom/)).toBeTruthy();
  });

  it('says the location is undecided when there is neither', async () => {
    const { getEvent } = await import('../../src/api/events.js');
    getEvent.mockResolvedValueOnce({ event: base });
    const { findByText } = render(EventDetail, { id: '1' });
    expect(await findByText(/Location to be announced/)).toBeTruthy();
  });
});

/**
 * Somebody who lands on one week of a weekly meeting should be able to tell
 * that it is a weekly meeting.
 */
describe('EventDetail, for an event that repeats', () => {
  it('says how it repeats and when it stops', async () => {
    const { getEvent } = await import('../../src/api/events.js');
    getEvent.mockResolvedValueOnce({
      event: {
        event_id: 1, rso_id: 2, title: 'IEEE Weekly Meeting',
        start_time: '2026-09-15T18:00:00', end_time: '2026-09-15T19:30:00',
        is_private: false, rso_name: 'IEEE UIUC',
        series_id: 3, series_interval_weeks: 1, series_days_of_week: 'Tue', series_ends_on: '2026-12-08',
      },
    });
    const { findByText } = render(EventDetail, { id: '1' });
    expect(await findByText('Repeats every Tuesday until December 8')).toBeTruthy();
  });

  it('says nothing of the sort for an event that does not repeat', async () => {
    const { container, findByRole } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    expect(container.textContent).not.toMatch(/Repeats/);
  });
});

/**
 * Three things the Discord bot made necessary on the page itself: a cancelled
 * event says so at the top, a location note sits beside the room, and the
 * number of people interested stands in for the RSVP count that was removed.
 */
describe('EventDetail, cancellation, the location note and interest', () => {
  const base = {
    event_id: 1, rso_id: 2, title: 'IEEE Workshop', description: 'Something',
    start_time: '2026-04-20T18:00:00', end_time: '2026-04-20T20:00:00',
    is_private: false, rso_name: 'IEEE UIUC', building: 'ECEB', room_number: '1002',
    cancelled_at: null, location_note: null, interest_count: 0,
  };

  it('says at the top that a cancelled event was cancelled', async () => {
    const { getEvent } = await import('../../src/api/events.js');
    getEvent.mockResolvedValueOnce({ event: { ...base, cancelled_at: '2026-04-19T09:00:00-05:00' } });
    const { findByText } = render(EventDetail, { id: 1 });
    expect(await findByText('This event was cancelled.')).toBeTruthy();
  });

  it('says nothing about cancellation otherwise', async () => {
    const { getEvent } = await import('../../src/api/events.js');
    getEvent.mockResolvedValueOnce({ event: base });
    const { findByRole, queryByText } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    expect(queryByText('This event was cancelled.')).toBeNull();
  });

  it('shows the location note beside the room', async () => {
    const { getEvent } = await import('../../src/api/events.js');
    getEvent.mockResolvedValueOnce({ event: { ...base, location_note: 'Use the north entrance.' } });
    const { findByText } = render(EventDetail, { id: 1 });
    expect(await findByText('Use the north entrance.')).toBeTruthy();
  });

  it('says how many people are interested, once anybody is', async () => {
    const { getEvent } = await import('../../src/api/events.js');
    getEvent.mockResolvedValueOnce({ event: { ...base, interest_count: 12 } });
    const { findByText } = render(EventDetail, { id: 1 });
    expect(await findByText('12 people are interested')).toBeTruthy();
  });

  it('counts one person in the singular', async () => {
    const { getEvent } = await import('../../src/api/events.js');
    getEvent.mockResolvedValueOnce({ event: { ...base, interest_count: 1 } });
    const { findByText } = render(EventDetail, { id: 1 });
    expect(await findByText('1 person is interested')).toBeTruthy();
  });

  it('says nothing about interest when nobody has shown any', async () => {
    const { getEvent } = await import('../../src/api/events.js');
    getEvent.mockResolvedValueOnce({ event: base });
    const { findByRole, queryByText } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    expect(queryByText(/interested/)).toBeNull();
  });
});

/**
 * The event page is a poster, built from the design system's own part.
 *
 * See docs/design/07-components.md "Event page parts" and
 * docs/design/08-surfaces.md "The event page".
 */
describe('EventDetail, as a poster', () => {
  it('draws the page as a poster', async () => {
    const { container, findByRole } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    expect(container.querySelector('.poster')).toBeTruthy();
  });

  it('lights the poster in the organization adapted colour, never the stored one', async () => {
    const { container, findByRole } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    await waitFor(() => {
      const style = container.querySelector('.poster').getAttribute('style');
      expect(style).toMatch(/--h: #/);
      expect(style.toLowerCase()).not.toContain('#006eb6');
    });
  });

  it('draws the tags as words with a stroke rather than as pills', async () => {
    const { container, findByRole } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    const tags = [...container.querySelectorAll('.poster .tags .hl')].map(tag => tag.textContent);
    expect(tags).toEqual(['Workshop', 'Free Food']);
  });

  it('offers one primary action and no more', async () => {
    const { container, findByRole } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    expect(container.querySelectorAll('.btn.primary').length).toBe(1);
  });

  it('draws icons rather than emoji', async () => {
    const { container, findByRole } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it('keeps the description as the markdown it was written in', async () => {
    const { container, findByRole } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    expect(container.querySelector('.txt strong')?.textContent).toBe('PCB design');
  });

  /**
   * The page dresses the markdown an organizer wrote: the space between
   * paragraphs, the bullets on a list, the colour of a link. Those rules were
   * written against a container the page had stopped drawing, so the compiler
   * called eleven of them unused and none of them reached a description. A list
   * in a description came out with no bullets and no indent.
   */
  it('puts the description inside the container the page dresses it in', async () => {
    const { container, findByRole } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    expect(container.querySelector('.txt .read strong')?.textContent).toBe('PCB design');
  });

  it('keeps the board tools away from a reader who is not on that board', async () => {
    const { container, findByRole } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    expect(container.querySelector('.poster .board')).toBeNull();
  });
});

/**
 * The poster draws its actions; the page is what makes them happen. Each of
 * these pins the label the component prints, so that a label changing in the
 * component is a failing test here rather than a control that quietly does
 * nothing.
 */
describe('EventDetail, the actions on the poster', () => {
  const press = async (findByRole, name) => {
    const button = await findByRole('button', { name });
    await fireEvent.click(button);
  };

  it('copies the link to this page', async () => {
    const written = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: written }, configurable: true });
    const { showToast } = await import('../../src/stores/ui.js');
    const { findByRole } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    await press(findByRole, 'Copy link');
    await waitFor(() => expect(written).toHaveBeenCalledWith(expect.stringContaining('/events/1')));
    expect(showToast).toHaveBeenCalledWith('Link copied.');
  });

  it('says so when the link could not be copied', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('no')) }, configurable: true,
    });
    const { showToast } = await import('../../src/stores/ui.js');
    const { findByRole } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    await press(findByRole, 'Copy link');
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('The link could not be copied.', 'error'));
  });

  it('hands over the event as a calendar file', async () => {
    const saved = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function () { saved.push(this.getAttribute('href')); });
    const { findByRole } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    await press(findByRole, 'Download .ics');
    expect(saved[0]).toContain('text/calendar');
    expect(decodeURIComponent(saved[0])).toContain('SUMMARY:IEEE Workshop');
    click.mockRestore();
  });

  it('opens the event in Google Calendar', async () => {
    const opened = vi.fn();
    window.open = opened;
    const { findByRole } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    await press(findByRole, 'Add to Google Calendar');
    expect(opened).toHaveBeenCalled();
    expect(opened.mock.calls[0][0]).toContain('calendar.google.com');
  });

  it('sends a board member to the poster designer for this event', async () => {
    const { navigate } = await import('../../src/lib/router.js');
    const { findByRole } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    await press(findByRole, 'Make a poster');
    expect(navigate).toHaveBeenCalledWith('/poster?event=1');
  });
});

/**
 * The poster takes the description as a snippet, because organizers write
 * markdown and the poster sets plain paragraphs. Rendering it in both places at
 * once is the mistake that shape invites, so it is pinned.
 */
describe('EventDetail, the description', () => {
  it('renders the description once, inside the poster', async () => {
    const { container } = render(EventDetail, { id: 1 });
    await waitFor(() => expect(container.querySelector('.poster')).toBeTruthy());
    const said = [...container.querySelectorAll('.txt')].filter(
      node => node.textContent.includes('PCB design'),
    );
    expect(said).toHaveLength(1);
    expect(said[0].closest('.poster')).toBeTruthy();
  });
});

/**
 * An event page used to link nowhere except back to the feed, so a reader who
 * wanted the rest of what an organization runs had to go and find it, and a
 * crawler that read the page learned of no other page from it. One way into
 * each page is thin linking for a site whose event pages Google has discovered
 * and declined to crawl.
 */
describe('the way through to the organization', () => {
  it('links to the page for the organization putting the event on', async () => {
    const { findByRole } = render(EventDetail, { id: 1 });
    const link = await findByRole('link', { name: /everything .* has on/i });
    expect(link.getAttribute('href')).toBe('/organizations/2');
  });
});
