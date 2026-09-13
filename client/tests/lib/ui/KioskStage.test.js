import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { KioskStage } from '../../../src/lib/components/ui/KioskStage/index.js';
import { organizationColor } from '../../../src/lib/organizationColor.js';

/**
 * The lobby screen after dark.
 *
 * The stage is the night sky as the whole screen, with the board drawn behind
 * it, the clock in the corner because the lobby has none, and the biggest type
 * in the system on the event that is showing. It is always the night sky
 * whatever the hour, because this is the one place the board should be visible
 * at full strength.
 *
 * It is checked against the kiosk block of docs/design/foundation.html, which is
 * the acceptance render, and against the .kiosk rules in
 * docs/design/reference/foundation.css.
 */
const WORKSHOP = {
  title: 'Intro to PCB Design Workshop',
  rso_name: 'IEEE',
  logo_color: '#00629B',
  building: 'ECEB',
  room_number: '1002',
  start_time: '2026-09-10T18:00:00-05:00',
  end_time: '2026-09-10T20:00:00-05:00',
};

/** Twenty one minutes into the workshop, which is the hour the reference draws. */
const DURING = new Date('2026-09-10T18:41:00-05:00');
/** The afternoon before it, when nothing is running yet. */
const BEFORE = new Date('2026-09-10T15:00:00-05:00');

/**
 * The board is a canvas the surface owns and the stage is handed, because the
 * board draws once per resize rather than once per frame and the stage has no
 * business knowing that.
 */
const board = createRawSnippet(() => ({
  render: () => '<canvas data-testid="board"></canvas>',
}));

const rail = createRawSnippet(() => ({
  render: () => '<div class="side" data-testid="rail"></div>',
}));

const draw = (props = {}) =>
  render(KioskStage, { event: WORKSHOP, now: DURING, position: 1, count: 12, ...props });

describe('KioskStage', () => {
  it('is the night sky as the whole screen, with the stage laid out inside it', () => {
    const { container } = draw();
    const kiosk = container.querySelector('.kiosk');
    expect(kiosk).toBeTruthy();
    expect(kiosk.querySelector(':scope > .main')).toBeTruthy();
    // The spacer is what pushes the title block to the foot of the screen.
    expect(kiosk.querySelector('.main > .spacer')).toBeTruthy();
  });

  it('shows the board it is handed rather than drawing one of its own', () => {
    const bare = draw();
    expect(bare.container.querySelector('canvas')).toBeNull();

    const withBoard = draw({ board });
    const canvas = withBoard.container.querySelector('.main canvas');
    expect(canvas).toBeTruthy();
    expect(canvas.dataset.testid).toBe('board');
  });

  it('says "Happening now" in words while the event is running, beside a breathing pad', () => {
    const { container } = draw();
    const tag = container.querySelector('.k-top .nowtag');
    expect(tag).toBeTruthy();
    expect(tag.textContent).toContain('Happening now');
    expect(tag.querySelector('.pad')).toBeTruthy();
  });

  it('does not say "Happening now" before the event has started', () => {
    const { container } = draw({ now: BEFORE });
    expect(container.querySelector('.nowtag')).toBeNull();
  });

  it('sets the clock on campus time, with a machine readable datetime', () => {
    const { container } = draw();
    const clock = container.querySelector('.k-top .t');
    expect(clock.tagName).toBe('TIME');
    expect(clock.getAttribute('datetime')).toBe(DURING.toISOString());
    expect(clock.textContent.replace(/\s+/g, '')).toBe('6:41PM');
    // The meridiem is the small cut beside the reading, not part of it.
    expect(clock.querySelector('small').textContent).toBe('PM');
  });

  it('writes the day under the clock, because a lobby screen is also a calendar', () => {
    const { container } = draw();
    const day = container.querySelector('.k-top .d');
    expect(day.tagName).toBe('TIME');
    expect(day.getAttribute('datetime')).toBe('2026-09-10');
    expect(day.textContent).toBe('Thursday, September 10');
  });

  it('names the organization beside a mark in the colour the organization chose', () => {
    const { container } = draw();
    const org = container.querySelector('.main .org');
    expect(org.textContent).toContain('IEEE');
    // The kiosk is dark whatever the theme, so the mark takes its dark reading.
    const mark = organizationColor(WORKSHOP.logo_color, 'mark', 'dark');
    expect(org.querySelector('.pad').getAttribute('style')).toContain(`--h: ${mark}`);
  });

  it('sets the title as the one heading on the screen', () => {
    const { container } = draw();
    const heading = container.querySelector('.main h1');
    expect(heading.textContent).toBe('Intro to PCB Design Workshop');
  });

  it('gives the hour the event ends and the room it is in', () => {
    const { container } = draw();
    const labels = [...container.querySelectorAll('.whenk .k')].map(node => node.textContent);
    expect(labels).toEqual(['Until', 'Room']);

    const until = container.querySelector('.whenk .big');
    expect(until.tagName).toBe('TIME');
    expect(until.getAttribute('datetime')).toBe(new Date(WORKSHOP.end_time).toISOString());
    expect(until.textContent.replace(/\s+/g, '')).toBe('8:00PM');

    expect(container.querySelector('.whenk .room').textContent).toBe('ECEB 1002');
  });

  /**
   * An organizer can file an event without an end time, and the stage still has
   * to answer the question a passer by is asking, which is when it happens.
   */
  it('gives the hour the event starts when nobody has said when it ends', () => {
    const { container } = draw({ event: { ...WORKSHOP, end_time: null }, now: BEFORE });
    expect(container.querySelector('.whenk .k').textContent).toBe('Starts');
    expect(container.querySelector('.whenk .big').getAttribute('datetime'))
      .toBe(new Date(WORKSHOP.start_time).toISOString());
  });

  it('signs the screen with the mark, the domain and the position in the rotation', () => {
    const { container } = draw({ position: 2, count: 7 });
    const foot = container.querySelector('.main .foot');
    expect(foot.querySelector('svg').getAttribute('aria-label')).toBe('VIA');
    expect(foot.textContent).toContain('viaillinois.com');
    expect(foot.textContent).toContain('2 of 7');
  });

  it('leaves the position out of the foot when there is only one event to show', () => {
    const { container } = draw({ position: 1, count: 1 });
    expect(container.querySelector('.main .foot').textContent).not.toContain('1 of 1');
  });

  it('puts the rail it is given beside the stage, inside the same screen', () => {
    const { container } = draw({ children: rail });
    const kiosk = container.querySelector('.kiosk');
    const children = [...kiosk.children];
    expect(children[0].classList.contains('main')).toBe(true);
    expect(children[1].dataset.testid).toBe('rail');
  });
});

/**
 * The stage shows what is next, and what is next is not always what is on today.
 * Both of these were found by holding the kiosk against the reference render:
 * the stage could say a time with no day on it, and it could say "Until" about
 * an event that had not started.
 */
describe('KioskStage, on an event that is not today', () => {
  const NOW = '2026-09-10T18:00:00-05:00';
  const soon = {
    event_id: 9,
    title: 'Battery Pack Build Night',
    rso_name: 'Illini Solar Car',
    logo_color: '#F59E0B',
    start_time: '2026-09-13T19:00:00-05:00',
    end_time: '2026-09-13T22:00:00-05:00',
    building: 'ECEB',
    room_number: '2070',
  };

  it('says which day it is on', () => {
    const { container } = render(KioskStage, { event: soon, now: NOW });
    const day = container.querySelector('.onday');
    expect(day).toBeTruthy();
    expect(day.textContent).toBe('Sunday');
    expect(day.getAttribute('datetime')).toBe('2026-09-13');
  });

  it('says nothing about the day when the event is today, because the clock already does', () => {
    const today = { ...soon, start_time: '2026-09-10T19:00:00-05:00', end_time: '2026-09-10T22:00:00-05:00' };
    const { container } = render(KioskStage, { event: today, now: NOW });
    expect(container.querySelector('.onday')).toBe(null);
  });

  it('says when it starts, not when it ends, until it has started', () => {
    const { container } = render(KioskStage, { event: soon, now: NOW });
    expect(container.querySelector('.whenk .k').textContent).toBe('Starts');
    expect(container.querySelector('.whenk .big').textContent.replace(/\s+/g, '')).toContain('7:00');
  });

  it('says when it ends once it has started', () => {
    const running = { ...soon, start_time: '2026-09-10T17:00:00-05:00', end_time: '2026-09-10T20:00:00-05:00' };
    const { container } = render(KioskStage, { event: running, now: NOW });
    expect(container.querySelector('.whenk .k').textContent).toBe('Until');
    expect(container.querySelector('.whenk .big').textContent.replace(/\s+/g, '')).toContain('8:00');
  });
});
