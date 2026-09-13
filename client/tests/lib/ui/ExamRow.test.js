import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { ExamRow } from '../../../src/lib/components/ui/ExamRow/index.js';
import { toInstant } from '../../../src/lib/campusTime.js';

/**
 * An exam is set like a line in a printed listing rather than like a card. The
 * course code is the headline, the time is a number, and the status is a word
 * with a highlighter stroke under it, because the site has no filled pills.
 *
 * See docs/design/07-components.md, the exam row, and the midterms block of
 * docs/design/foundation.html, which is the render this is measured against.
 */
describe('ExamRow', () => {
  const EXAM = {
    midterm_id: 7,
    course_code: 'ECE 210',
    course_title: 'Analog Signal Processing',
    title: 'Midterm 1',
    start_time: '2026-09-18 19:00:00',
    end_time: '2026-09-18 20:30:00',
    status: 'Confirmed',
    building: 'ECEB',
    room_number: '1002',
  };

  const draw = (changes = {}) => render(ExamRow, { exam: { ...EXAM, ...changes } }).container;

  /** The course code is the text of the headline, without the title under it. */
  const headlineOf = container => [...container.querySelector('.exam .code').childNodes]
    .filter(node => node.nodeType === node.TEXT_NODE)
    .map(node => node.textContent)
    .join('');

  it('is one row of the five columns the listing is set on', () => {
    const row = draw().querySelector('.exam');
    expect(row).toBeTruthy();
    expect(row.children).toHaveLength(5);
  });

  it('sets the course code as the headline with the course title under it', () => {
    const container = draw();
    expect(headlineOf(container)).toBe('ECE 210');
    expect(container.querySelector('.exam .code small').textContent).toBe('Analog Signal Processing');
  });

  /**
   * The platform stores a course code as it was submitted, and some rows arrive
   * with the space missing or the letters in lower case. The listing writes one
   * form, "ECE 391", so that a column of codes reads as a column.
   */
  it('writes a course code with a space between the letters and the number', () => {
    expect(headlineOf(draw({ course_code: 'ECE391' }))).toBe('ECE 391');
    expect(headlineOf(draw({ course_code: 'ece 391' }))).toBe('ECE 391');
  });

  it('names the exam beside the course', () => {
    expect(draw().querySelector('.exam .ttl').textContent).toBe('Midterm 1');
  });

  it('gives the date and the time of day, and carries the instant with them', () => {
    const time = draw().querySelector('.exam .tm > time');
    expect(time.textContent).toBe('Fri Sep 18, 7:00 PM');
    expect(time.getAttribute('datetime')).toBe(toInstant(EXAM.start_time).toISOString());
  });

  it('sets how long the exam runs under the time, in mono', () => {
    const duration = draw().querySelector('.exam .tm small time');
    expect(duration.textContent).toBe('90 minutes');
    expect(duration.getAttribute('datetime')).toBe('PT90M');
  });

  it('counts a whole number of hours in hours rather than in minutes', () => {
    expect(draw({ end_time: '2026-09-18 21:00:00' }).querySelector('.exam .tm small time').textContent)
      .toBe('2 hours');
    expect(draw({ end_time: '2026-09-18 20:00:00' }).querySelector('.exam .tm small time').textContent)
      .toBe('1 hour');
  });

  it('writes the room as the building and the room number', () => {
    expect(draw().querySelector('.exam .rm').textContent).toBe('ECEB 1002');
  });

  /**
   * A room that came in with the HKN import is free text and matches no room
   * record, so the row takes what it is given rather than showing a gap.
   */
  it('takes a room written as one piece of text where that is all there is', () => {
    expect(draw({ building: null, room_number: null, room: 'Loomis 141' }).querySelector('.exam .rm').textContent)
      .toBe('Loomis 141');
  });

  it('draws the status as a highlighted word rather than as a filled pill', () => {
    const status = draw().querySelector('.exam .st');
    expect(status.tagName).toBe('SPAN');
    expect(status.classList.contains('hl')).toBe(true);
    expect(status.textContent).toBe('Confirmed');
  });

  it.each([
    ['Confirmed', 'var(--ok)'],
    ['Pending', 'var(--warn)'],
    ['Cancelled', 'var(--danger)'],
  ])('gives the %s status its own colour', (status, tone) => {
    const drawn = draw({ status }).querySelector('.exam .st');
    expect(drawn.textContent).toBe(status);
    expect(drawn.getAttribute('style')).toContain(tone);
  });

  it('says the status in words, so that the colour is never the only sign of it', () => {
    expect(draw({ status: 'Cancelled' }).querySelector('.exam .st').textContent).toBe('Cancelled');
  });
});
