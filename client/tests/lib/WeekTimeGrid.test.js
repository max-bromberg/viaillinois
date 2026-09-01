import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import WeekTimeGrid from '../../src/lib/WeekTimeGrid.svelte';

/**
 * A column on this grid is a campus day and a row is a campus hour. Bucketed by
 * the reader's own clock instead, a Wednesday evening event slid into Thursday
 * for anyone east of Illinois, and sat at the wrong height for everyone else.
 */
const weekDays = Array.from({ length: 7 }, (_, i) => new Date(2026, 6, 12 + i)); // Sun 12 Jul

// `events` is also the name of a Svelte mount option, so props are nested.
function grid(props) {
  return render(WeekTimeGrid, {
    props: {
      weekDays,
      events: [],
      midterms: [],
      today: new Date(2026, 6, 15),
      rsoColorMap: {},
      loading: false,
      ...props,
    },
  });
}

const lateEvent = {
  event_id: 1,
  title: 'Late night build session',
  rso_name: 'IEEE UIUC',
  start_time: '2026-07-15T21:30:00-05:00',
  end_time: '2026-07-15T23:00:00-05:00',
  is_private: false,
};

describe('WeekTimeGrid', () => {
  it('places a late evening event on the campus day it happens on', () => {
    const { getAllByTitle } = grid({ events: [lateEvent] });
    const [box] = getAllByTitle(/Late night build session/);
    // Seven columns follow the hour label column, so Wednesday is the fourth.
    const columns = box.closest('.grid').querySelectorAll(':scope > div');
    const wednesday = columns[4];
    expect(wednesday.contains(box)).toBe(true);
  });

  // A box only carries its start time once it is tall enough to show one.
  const eveningEvent = {
    ...lateEvent,
    start_time: '2026-07-15T18:30:00-05:00',
    end_time: '2026-07-15T20:30:00-05:00',
  };

  it('labels the event with the campus hour it starts at', () => {
    const { getByText } = grid({ events: [eveningEvent] });
    expect(getByText('6:30pm')).toBeTruthy();
  });

  it('shows the same hour to a reader on the other side of the world', () => {
    // The same instant, written from Tokyo's point of view.
    const { getByText } = grid({
      events: [{ ...eveningEvent, start_time: '2026-07-16T08:30:00+09:00' }],
    });
    expect(getByText('6:30pm')).toBeTruthy();
  });

  it('places a midterm on its campus day too', () => {
    const { getAllByTitle } = grid({
      midterms: [{
        midterm_id: 1, course_code: 'ECE 210', title: 'Midterm 2',
        start_time: '2026-07-15T19:00:00-05:00', end_time: '2026-07-15T21:00:00-05:00',
      }],
    });
    const [box] = getAllByTitle(/Midterm: Midterm 2/);
    const columns = box.closest('.grid').querySelectorAll(':scope > div');
    expect(columns[4].contains(box)).toBe(true);
  });
});
