import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import EventCard from '../../src/lib/EventCard.svelte';

const mockEvent = {
  event_id: 1,
  title: 'IEEE Workshop',
  description: 'Learn PCB design',
  start_time: '2026-04-10 18:00:00',
  end_time:   '2026-04-10 20:00:00',
  rso_name: 'IEEE UIUC',
  building: 'ECEB',
  room_number: '1002',
  tags: 'Workshop,Free Food',
};

describe('EventCard', () => {
  it('renders event title', () => {
    const { getByText } = render(EventCard, { event: mockEvent });
    expect(getByText('IEEE Workshop')).toBeTruthy();
  });

  it('renders RSO name', () => {
    const { getByText } = render(EventCard, { event: mockEvent });
    expect(getByText('IEEE UIUC')).toBeTruthy();
  });

  it('renders location', () => {
    const { getByText } = render(EventCard, { event: mockEvent });
    expect(getByText(/ECEB 1002/)).toBeTruthy();
  });

  it('renders tags as badges', () => {
    const { getByText } = render(EventCard, { event: mockEvent });
    expect(getByText('Workshop')).toBeTruthy();
    expect(getByText('Free Food')).toBeTruthy();
  });

  it('renders the title as a link to the event detail page', () => {
    const { getByRole } = render(EventCard, { event: mockEvent });
    const link = getByRole('link', { name: 'IEEE Workshop' });
    expect(link.getAttribute('href')).toBe('/events/1');
  });
});

/**
 * A location is optional and can be either a room or free text, so the card has
 * three cases to render rather than one.
 */
describe('EventCard location', () => {
  const base = { ...mockEvent, building: null, room_number: null, location_text: null };

  it('shows the room when the event is in one', () => {
    const { getByText } = render(EventCard, { event: mockEvent });
    expect(getByText(/ECEB 1002/)).toBeTruthy();
  });

  it('shows the free text when there is no room', () => {
    const { getByText } = render(EventCard, { event: { ...base, location_text: 'Zoom' } });
    expect(getByText(/Zoom/)).toBeTruthy();
  });

  it('says the location is undecided when there is neither', () => {
    const { getByText } = render(EventCard, { event: base });
    expect(getByText(/Location to be announced/)).toBeTruthy();
  });

  it('prefers the room over the free text when both are present', () => {
    const { getByText, queryByText } = render(EventCard, {
      event: { ...mockEvent, location_text: 'Zoom' },
    });
    expect(getByText(/ECEB 1002/)).toBeTruthy();
    expect(queryByText(/Zoom/)).toBeNull();
  });
});

/**
 * VIA serves one campus, so a card shows campus time. The API sends the offset
 * with each time, and rendering that in the reader's own zone moved the event
 * for anyone not sitting in Illinois.
 */
describe('EventCard shows campus time', () => {
  const timed = { ...mockEvent, start_time: '2026-04-10T18:00:00-05:00' };

  it('shows the hour the event starts on campus', () => {
    const { getByText } = render(EventCard, { event: timed });
    expect(getByText(/Fri, Apr 10 at 6:00 PM/)).toBeTruthy();
  });

  it('shows the same hour for a reader on the other side of the world', () => {
    // The same instant, written from Tokyo's point of view.
    const { getByText } = render(EventCard, {
      event: { ...mockEvent, start_time: '2026-04-11T08:00:00+09:00' },
    });
    expect(getByText(/Fri, Apr 10 at 6:00 PM/)).toBeTruthy();
  });

  it('keeps a winter event on central standard time', () => {
    const { getByText } = render(EventCard, {
      event: { ...mockEvent, start_time: '2026-01-15T18:00:00-06:00' },
    });
    expect(getByText(/Thu, Jan 15 at 6:00 PM/)).toBeTruthy();
  });
});
