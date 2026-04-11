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
});
