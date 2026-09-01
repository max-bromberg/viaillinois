import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import KioskCard from '../../src/lib/KioskCard.svelte';

const base = {
  event_id: 1,
  title: 'IEEE Workshop',
  rso_name: 'IEEE UIUC',
  start_time: '2026-04-10 18:00:00',
  end_time: '2026-04-10 20:00:00',
  building: null,
  room_number: null,
  location_text: null,
};

describe('KioskCard location', () => {
  it('shows the room when the event is in one', () => {
    const { getByText } = render(KioskCard, {
      event: { ...base, building: 'ECEB', room_number: '1002' },
    });
    expect(getByText(/ECEB 1002/)).toBeTruthy();
  });

  it('shows the free text when there is no room', () => {
    const { getByText } = render(KioskCard, { event: { ...base, location_text: 'Zoom' } });
    expect(getByText(/Zoom/)).toBeTruthy();
  });

  it('says the location is undecided when there is neither', () => {
    const { getByText } = render(KioskCard, { event: base });
    expect(getByText(/Location to be announced/)).toBeTruthy();
  });
});

/** The kiosk hangs in a building lobby, so it shows the clock on the wall. */
describe('KioskCard shows campus time', () => {
  it('shows the hour the event starts on campus', () => {
    const { getByText } = render(KioskCard, {
      event: { ...base, start_time: '2026-04-10T18:00:00-05:00' },
    });
    expect(getByText('6:00 PM')).toBeTruthy();
    expect(getByText('Friday, April 10')).toBeTruthy();
  });
});
