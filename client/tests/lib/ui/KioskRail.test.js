import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { KioskRail } from '../../../src/lib/components/ui/KioskRail/index.js';

/**
 * The column down the right of the lobby screen.
 *
 * It lists what comes next with the times set large enough to read while
 * walking past, and it ends with this month's midterms, which is the one thing a
 * student passing a lobby screen in October is looking for. It stands on a
 * darker translucent ground so that the stage beside it keeps the eye first.
 *
 * It is checked against the kiosk block of docs/design/foundation.html, which is
 * the acceptance render, and against the .kiosk .side rules in
 * docs/design/reference/foundation.css.
 */
const NOW = new Date('2026-09-10T18:41:00-05:00');

const NEXT = [
  {
    title: 'Fall General Meeting',
    rso_name: 'HKN',
    building: 'ECEB',
    room_number: '3017',
    start_time: '2026-09-10T19:00:00-05:00',
  },
  {
    title: 'Texas Instruments Info Session',
    rso_name: 'WECE',
    building: 'ECEB',
    room_number: '1013',
    start_time: '2026-09-11T17:30:00-05:00',
  },
  {
    title: 'Battery Pack Build Night',
    rso_name: 'Illini Solar Car',
    location_text: 'The Illini Solar Car garage',
    start_time: '2026-09-11T19:00:00-05:00',
  },
];

const MIDTERMS = [
  {
    course_code: 'ECE 210',
    title: 'Midterm 1',
    building: 'ECEB',
    room_number: '1002',
    start_time: '2026-09-18T19:00:00-05:00',
  },
  {
    course_code: 'ECE 385',
    title: 'Midterm',
    building: 'ECEB',
    room_number: '1013',
    start_time: '2026-09-23T19:00:00-05:00',
  },
];

const draw = (props = {}) => render(KioskRail, { next: NEXT, midterms: MIDTERMS, now: NOW, ...props });

const headings = container => [...container.querySelectorAll('.side h3')].map(node => node.textContent);

describe('KioskRail', () => {
  it('is a column standing on the darker ground beside the stage', () => {
    const { container } = draw();
    expect(container.querySelector('.side')).toBeTruthy();
  });

  it('heads the two lists, with the midterms at the bottom', () => {
    const { container } = draw();
    expect(headings(container)).toEqual(['Next up', 'Midterms']);
    // The second heading is pushed down so the midterms sit at the foot of the
    // column however many events are listed above them.
    const [, midterms] = container.querySelectorAll('.side h3');
    expect(midterms.getAttribute('style')).toContain('margin-top: auto');
  });

  it('lists what is next, in the order it is given', () => {
    const { container } = draw();
    const titles = [...container.querySelectorAll('.side .item b')].map(node => node.textContent);
    expect(titles.slice(0, 3)).toEqual([
      'Fall General Meeting',
      'Texas Instruments Info Session',
      'Battery Pack Build Night',
    ]);
  });

  it('sets the hour large with the day under it, and a machine readable datetime on both', () => {
    const { container } = draw();
    const [first] = container.querySelectorAll('.side .item');
    const when = first.querySelector('.t');
    expect(when.tagName).toBe('TIME');
    expect(when.getAttribute('datetime')).toBe(new Date(NEXT[0].start_time).toISOString());
    expect(when.childNodes[0].textContent).toBe('7:00');
    // "Today", "Tomorrow", then the weekday name, which is how the whole site
    // names days. See client/src/lib/campusTime.js.
    expect(when.querySelector('small').textContent).toBe('Today');
  });

  it('names tomorrow as tomorrow rather than by its weekday', () => {
    const { container } = draw();
    const items = container.querySelectorAll('.side .item');
    expect(items[1].querySelector('.t small').textContent).toBe('Tomorrow');
  });

  it('puts the organization and the room together under each title', () => {
    const { container } = draw();
    const items = container.querySelectorAll('.side .item');
    expect(items[0].querySelector('span').textContent).toBe('HKN · ECEB 3017');
    // A room VIA knows about wins, and free text stands in where there is none.
    expect(items[2].querySelector('span').textContent)
      .toBe('Illini Solar Car · The Illini Solar Car garage');
  });

  it('lists this month’s midterms by course and date', () => {
    const { container } = draw();
    const items = [...container.querySelectorAll('.side .item')].slice(NEXT.length);
    expect(items).toHaveLength(2);

    const when = items[0].querySelector('.t');
    expect(when.tagName).toBe('TIME');
    expect(when.getAttribute('datetime')).toBe(new Date(MIDTERMS[0].start_time).toISOString());
    expect(when.textContent).toBe('Sep 18');

    expect(items[0].querySelector('b').textContent).toBe('ECE 210 Midterm 1');
    expect(items[0].querySelector('span').textContent).toBe('ECEB 1002 · 7:00 PM');
  });

  /**
   * A lobby screen runs for weeks without anybody looking at it, so an empty
   * list has to read as an answer rather than as a heading with a hole under it.
   */
  it('says so in a sentence when there is nothing next', () => {
    const { container } = draw({ next: [] });
    expect(container.textContent).toContain('Nothing else is on today.');
  });

  it('drops the midterms heading entirely when there are none this month', () => {
    const { container } = draw({ midterms: [] });
    expect(headings(container)).toEqual(['Next up']);
  });
});
