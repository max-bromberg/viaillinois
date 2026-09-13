import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import WeekTimeGrid from '../../src/lib/WeekTimeGrid.svelte';
import { organizationColor } from '../../src/lib/organizationColor.js';

/**
 * A column on this grid is a campus day and a row is a campus hour. Bucketed by
 * the reader's own clock instead, a Wednesday evening event slid into Thursday
 * for anyone east of Illinois, and sat at the wrong height for everyone else.
 */
const weekDays = Array.from({ length: 7 }, (_, i) => new Date(2026, 6, 12 + i)); // Sun 12 Jul

const IEEE_MARK = organizationColor('#00629B', 'mark', 'light');

// `events` is also the name of a Svelte mount option, so props are nested.
function grid(props) {
  return render(WeekTimeGrid, {
    props: {
      weekDays,
      events: [],
      midterms: [],
      today: new Date(2026, 6, 15),
      marks: {},
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

/** The seven day columns, in order. Wednesday is the fourth. */
const columns = container => container.querySelectorAll('[data-day-column]');

describe('WeekTimeGrid', () => {
  it('places a late evening event on the campus day it happens on', () => {
    const { container, getAllByTitle } = grid({ events: [lateEvent] });
    const [box] = getAllByTitle(/Late night build session/);
    expect(columns(container)[3].contains(box)).toBe(true);
  });

  // A box only carries its start time once it is tall enough to show one.
  const eveningEvent = {
    ...lateEvent,
    start_time: '2026-07-15T18:30:00-05:00',
    end_time: '2026-07-15T20:30:00-05:00',
  };

  it('labels the event with the campus hour it starts at', () => {
    const { getByText } = grid({ events: [eveningEvent] });
    // docs/design/10-voice.md writes times as "6:30 PM", with the space.
    expect(getByText('6:30 PM')).toBeTruthy();
  });

  it('shows the same hour to a reader on the other side of the world', () => {
    // The same instant, written from Tokyo's point of view.
    const { getByText } = grid({
      events: [{ ...eveningEvent, start_time: '2026-07-16T08:30:00+09:00' }],
    });
    expect(getByText('6:30 PM')).toBeTruthy();
  });

  it('places a midterm on its campus day too', () => {
    const { container, getAllByTitle } = grid({
      midterms: [{
        midterm_id: 1, course_code: 'ECE 210', title: 'Midterm 2',
        start_time: '2026-07-15T19:00:00-05:00', end_time: '2026-07-15T21:00:00-05:00',
      }],
    });
    const [box] = getAllByTitle(/Midterm: Midterm 2/);
    expect(columns(container)[3].contains(box)).toBe(true);
  });
});

/**
 * The week view follows the calendar's rules: a 2 px trace in the
 * organization's adapted mark colour on the left of the entry's text, plum for
 * a midterm, and the day numbers condensed with today's in signal. See
 * docs/design/08-surfaces.md.
 */
describe('WeekTimeGrid under the design system', () => {
  it('traces an entry in the organization’s adapted colour', () => {
    const { getAllByTitle } = grid({
      events: [lateEvent],
      marks: { 'IEEE UIUC': IEEE_MARK },
    });
    const [box] = getAllByTitle(/Late night build session/);
    expect(box.getAttribute('style')).toContain(IEEE_MARK);
  });

  it('traces a midterm in plum, and spends no emoji on it', () => {
    const { container, getAllByTitle } = grid({
      midterms: [{
        midterm_id: 1, course_code: 'ECE 210', title: 'Midterm 2',
        start_time: '2026-07-15T19:00:00-05:00', end_time: '2026-07-15T21:00:00-05:00',
      }],
    });
    const [box] = getAllByTitle(/Midterm: Midterm 2/);
    expect(box.getAttribute('style')).toContain('var(--plum)');
    expect(container.textContent).not.toContain('\u{1F4DD}');
  });

  it('marks today’s day number and leaves the other six alone', () => {
    const { container } = grid({});
    const marked = container.querySelectorAll('.daynum.today');
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent.trim()).toBe('15');
  });

  /** docs/design/11-implementation.md: nothing is set below 12 pixels. */
  it('sets the hour gutter at twelve pixels, in words the site uses', () => {
    const { getByText } = grid({});
    expect(getByText('8 AM')).toBeTruthy();
  });

  /** Loading draws the shape of what is coming, with no shimmer. */
  it('draws the shape of the entries while it waits, without a shimmer', () => {
    const { container } = grid({ loading: true });
    expect(container.querySelectorAll('.shape').length).toBeGreaterThan(0);
    expect(container.querySelector('.shimmer')).toBeNull();
  });
});
