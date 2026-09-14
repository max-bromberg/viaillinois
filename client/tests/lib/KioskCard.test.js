import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/svelte';
import KioskCard from '../../src/lib/KioskCard.svelte';
import { organizationColor } from '../../src/lib/organizationColor.js';

/**
 * One screen of the lobby display.
 *
 * The card is the stage and the rail together: the night sky as the whole
 * screen, the board drawn behind it, the event in the biggest type in the
 * system, and a column down the right saying what is on after it. See
 * docs/design/08-surfaces.md and the kiosk block of docs/design/foundation.html,
 * which is the acceptance render.
 */

/**
 * The board paints to a canvas, and jsdom has none. Every call on the context
 * is answered with a function that does nothing, so the real board mounts and
 * the card can be asked whether it drew one.
 */
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = () =>
    new Proxy({}, { get: () => () => {}, set: () => true });
});

const base = {
  event_id: 1,
  title: 'IEEE Workshop',
  rso_name: 'IEEE UIUC',
  logo_color: '#00629B',
  start_time: '2026-04-10T18:00:00-05:00',
  end_time: '2026-04-10T20:00:00-05:00',
  building: null,
  room_number: null,
  location_text: null,
};

/** An hour before the workshop starts, and an hour after it has. */
const BEFORE = new Date('2026-04-10T17:00:00-05:00');
const DURING = new Date('2026-04-10T19:00:00-05:00');

const draw = (props = {}) =>
  render(KioskCard, { event: base, now: BEFORE, position: 1, count: 12, ...props });

describe('KioskCard location', () => {
  it('shows the room when the event is in one', () => {
    const { container } = draw({ event: { ...base, building: 'ECEB', room_number: '1002' } });
    expect(container.querySelector('.whenk .room').textContent).toBe('ECEB 1002');
  });

  it('shows the free text when there is no room', () => {
    const { container } = draw({ event: { ...base, location_text: 'Zoom' } });
    expect(container.querySelector('.whenk .room').textContent).toBe('Zoom');
  });

  it('says the location is undecided when there is neither', () => {
    const { container } = draw();
    expect(container.querySelector('.whenk .room').textContent).toBe('Location to be announced');
  });
});

/** The kiosk hangs in a building lobby, so it shows the clock on the wall. */
describe('KioskCard shows campus time', () => {
  it('sets the clock and the day on campus time', () => {
    const { container } = draw();
    expect(container.querySelector('.k-top .t').textContent.replace(/\s+/g, '')).toBe('5:00PM');
    expect(container.querySelector('.k-top .d').textContent).toBe('Friday, April 10');
  });

  /**
   * The stage says "Until" when it is handed an hour the event ends, which is
   * the right thing to say while an event is running and the wrong thing to say
   * about one that has not started. The kiosk serves what is still to come, so
   * most of what it shows has not started.
   */
  it('says when an event that has not started starts', () => {
    const { container } = draw();
    expect(container.querySelector('.whenk .k').textContent).toBe('Starts');
    expect(container.querySelector('.whenk .big').textContent.replace(/\s+/g, '')).toBe('6:00PM');
    expect(container.querySelector('.nowtag')).toBeNull();
  });

  it('says when a running event ends, and says that it is running', () => {
    const { container } = draw({ now: DURING });
    expect(container.querySelector('.whenk .k').textContent).toBe('Until');
    expect(container.querySelector('.whenk .big').textContent.replace(/\s+/g, '')).toBe('8:00PM');
    expect(container.querySelector('.nowtag').textContent).toContain('Happening now');
  });
});

describe('KioskCard', () => {
  /**
   * docs/design/04-color.md: an organization's colour is stored exactly as it
   * was given and never shown exactly as it was given. The kiosk is dark
   * whatever the theme, so the mark takes its dark reading.
   */
  it('draws the organization mark in the adapted colour, never the stored one', () => {
    const { container } = draw();
    const pad = container.querySelector('.main .org .pad');
    expect(pad.getAttribute('style')).toContain(organizationColor(base.logo_color, 'mark', 'dark'));
    expect(pad.getAttribute('style')).not.toContain(base.logo_color);
  });

  it('draws the board behind the stage', () => {
    const { container } = draw();
    expect(container.querySelector('.kiosk .main canvas')).toBeTruthy();
  });

  it('is the whole screen rather than the reference render’s slab', () => {
    const { container } = draw();
    expect(container.querySelector('.kiosk')).toBeTruthy();
    expect(container.querySelector('.kiosk > .side')).toBeTruthy();
  });

  it('lists what is on next beside the stage', () => {
    const { container } = draw({
      next: [{
        event_id: 2, title: 'Fall General Meeting', rso_name: 'HKN',
        building: 'ECEB', room_number: '3017',
        start_time: '2026-04-10T19:00:00-05:00',
      }],
    });
    const titles = [...container.querySelectorAll('.side .item b')].map(node => node.textContent);
    expect(titles).toContain('Fall General Meeting');
  });

  it('lists this month’s midterms under the events', () => {
    const { container } = draw({
      midterms: [{
        midterm_id: 3, course_code: 'ECE 210', title: 'Midterm 1',
        building: 'ECEB', room_number: '1002',
        start_time: '2026-04-14T19:00:00-05:00',
      }],
    });
    expect(container.textContent).toContain('ECE 210 Midterm 1');
  });

  it('says where it is in the rotation, beside the mark that leads the screen', () => {
    const { container } = draw({ position: 3, count: 12 });
    expect(container.querySelector('.k-top .brand').textContent).toContain('3 of 12');
  });

  /**
   * docs/design/08-surfaces.md: the crossfade between events is the settle
   * movement applied to the title block. A CSS animation only runs again when
   * its name changes, and the stage is never torn down (the board behind it
   * would be redrawn every eight seconds), so the two turns carry two names for
   * the same movement and the rotation alternates between them.
   */
  it('settles the title block each time the rotation turns', () => {
    const odd = draw({ position: 1 }).container.querySelector('.kiosk');
    const even = draw({ position: 2 }).container.querySelector('.kiosk');
    expect(odd.classList.contains('turn-a')).toBe(true);
    expect(even.classList.contains('turn-b')).toBe(true);
  });
});
