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
