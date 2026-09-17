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

/**
 * The week view says the same thing the month view says.
 *
 * The legend of coloured squares went when the calendar took the design
 * system's rail, and the internal marking went with it in both views. A reader
 * paging through the week has the same question a reader paging through the
 * month has, so it is answered the same way: a hollow pad and the word, never
 * colour on its own.
 */
describe('an internal event in the week view', () => {
  it('marks it with a hollow pad and says so in words', () => {
    const { container } = grid({
      events: [{ ...lateEvent, event_id: 9, title: 'Board Sync', is_private: 1 }],
    });
    const entry = container.querySelector('.entry');
    expect(entry.querySelector('.pad.hollow')).toBeTruthy();
    expect(`${entry.getAttribute('title')} ${entry.textContent}`).toMatch(/internal/i);
  });

  it('leaves a public event unmarked', () => {
    const { container } = grid({ events: [lateEvent] });
    expect(container.querySelector('.entry .pad')).toBe(null);
  });
});

/**
 * An event block was drawn in the same fill as the grid it sits on.
 *
 * The week grid is hairlines on the card, and the block filled itself with the
 * card too, so the only part of an event a reader could see was the two pixel
 * hue bar down its left edge. The block's own area, which is where the title
 * and the time are, was invisible in both themes, because both surfaces read
 * the same token.
 *
 * The block is tinted with the organization's hue now, which is the device the
 * rest of the design already uses to say which organization something belongs
 * to, so the block is both visible and identifiable at a glance.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fillOf = (file, selector) => {
  const source = readFileSync(resolve(process.cwd(), file), 'utf8');
  const at = source.indexOf(`\n  ${selector} {`);
  const rule = source.slice(at, source.indexOf('}', at));
  return rule.match(/background:\s*([^;]+);/)?.[1]?.trim() ?? null;
};

describe('an event block in the week view', () => {
  it('is not drawn in the same fill as the grid behind it', () => {
    const block = fillOf('src/lib/WeekTimeGrid.svelte', '.entry');
    const grid = fillOf('src/routes/Calendar.svelte', '.month');
    expect(block).toBeTruthy();
    expect(grid).toBe('var(--card)');
    expect(block).not.toBe(grid);
  });

  it('carries the organization hue into its fill, not only into its edge', () => {
    expect(fillOf('src/lib/WeekTimeGrid.svelte', '.entry')).toContain('var(--h)');
  });
});

/**
 * A midterm block in the week view is not an exam row on the midterm schedule.
 *
 * It was named .exam to tell it apart from an event block, and .exam is the
 * design system's own exam row: a five column grid with a hairline above it and
 * the settle movement on it. The block is absolutely positioned inside a day
 * column, so what a reader saw was every midterm block sitting eight pixels low
 * and sliding up on each render while the event blocks beside it held still.
 * The motion document gives rows settle to the agenda and the midterm schedule,
 * which are the two lists somebody watches arrive, and not to a calendar cell.
 */
import { borrowedIn } from '../support/designClasses.js';

describe('the week view and the design system class names', () => {
  it('names no element with a class the stylesheet claims for something else', () => {
    const { container } = grid({
      events: [lateEvent],
      midterms: [{
        midterm_id: 1, course_code: 'ECE 210', title: 'Midterm 1',
        start_time: '2026-07-15T19:00:00-05:00', end_time: '2026-07-15T21:00:00-05:00',
      }],
    });
    // .mono and .head are the design system's own: the first is a type role
    // this view uses deliberately, and the second is only ever written as a
    // descendant of .mt, so it cannot reach anything here.
    const ours = new Set(['pad', 'hl', 'mono', 'head']);
    expect(borrowedIn(container).filter(name => !ours.has(name))).toEqual([]);
  });
});
