import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import MidtermRow from '../../src/lib/MidtermRow.svelte';

const base = {
  midterm_id: 1,
  title: 'ECE 210 Midterm 1',
  course_code: 'ECE 210',
  course_title: 'Analog Signal Processing',
  start_time: '2026-10-01 19:00:00',
  status: 'upcoming',
  building: null,
  room_number: null,
  location_text: null,
};

describe('MidtermRow location', () => {
  it('shows the room when the midterm is in one', () => {
    const { getByText } = render(MidtermRow, {
      midterm: { ...base, building: 'Everitt Laboratory', room_number: '2310' },
    });
    expect(getByText(/Everitt Laboratory 2310/)).toBeTruthy();
  });

  it('shows the free text when there is no room', () => {
    const { getByText } = render(MidtermRow, { midterm: { ...base, location_text: 'Conflict exam room' } });
    expect(getByText(/Conflict exam room/)).toBeTruthy();
  });

  it('says the location is undecided when there is neither', () => {
    const { getByText } = render(MidtermRow, { midterm: base });
    expect(getByText(/Location to be announced/)).toBeTruthy();
  });
});
