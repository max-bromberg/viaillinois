import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { DayGroup } from '../../../src/lib/components/ui/DayGroup/index.js';

/**
 * The page is an agenda. Events read top to bottom, grouped by day, and the day
 * name is the largest thing in the left column so a week can be scanned without
 * reading a single title. Today's name is in signal and its pad breathes, which
 * is the one thing on the agenda that says now.
 */
const TODAY = '2026-09-10T09:00:00-05:00';

describe('DayGroup', () => {
  it('names the day and dates it, with each line doing a different job', () => {
    const { container } = render(DayGroup, { day: '2026-09-12T18:00:00-05:00', now: TODAY });
    expect(container.querySelector('.dh b').textContent).toBe('Saturday');
    // The name already carries the weekday, so the date does not repeat it.
    expect(container.querySelector('.dh time').textContent).toBe('Sep 12');
  });

  it('names a day far out by its weekday rather than by its date twice over', () => {
    const { container } = render(DayGroup, { day: '2026-10-03T18:00:00-05:00', now: TODAY });
    expect(container.querySelector('.dh b').textContent).toBe('Saturday');
    expect(container.querySelector('.dh time').textContent).toBe('Oct 3');
  });

  it('calls today Today and tomorrow Tomorrow', () => {
    const { container: today } = render(DayGroup, { day: TODAY, now: TODAY });
    expect(today.querySelector('.dh b').textContent).toBe('Today');
    const { container: tomorrow } = render(DayGroup, { day: '2026-09-11T18:00:00-05:00', now: TODAY });
    expect(tomorrow.querySelector('.dh b').textContent).toBe('Tomorrow');
  });

  it('marks today, and breathes only there', () => {
    const { container } = render(DayGroup, { day: TODAY, now: TODAY });
    const group = container.querySelector('.day');
    expect(group.classList.contains('today')).toBe(true);
    const pad = group.querySelector('.pad');
    expect(pad.classList.contains('breathing')).toBe(true);
    // The day pad breathes more slowly than the pad on a live row, so the two
    // never pulse in step and look like one animation.
    expect(pad.getAttribute('style')).toContain('--pace: 2s');
  });

  it('leaves every other day with a hollow pad that does not move', () => {
    const { container } = render(DayGroup, { day: '2026-09-12T18:00:00-05:00', now: TODAY });
    const pad = container.querySelector('.pad');
    expect(pad.classList.contains('hollow')).toBe(true);
    expect(pad.classList.contains('breathing')).toBe(false);
  });

  /**
   * docs/design/09-accessibility.md: day names are headings, so that a screen
   * reader can move through the agenda a day at a time.
   */
  it('makes the day name a heading, and dates it in machine readable form', () => {
    const { container } = render(DayGroup, { day: TODAY, now: TODAY });
    const heading = container.querySelector('h3');
    expect(heading).toBeTruthy();
    expect(heading.textContent).toContain('Today');
    expect(container.querySelector('time').getAttribute('datetime')).toBe('2026-09-10');
  });

  it('says the date in the heading as well as the name, so Today is not the whole answer', () => {
    const { container } = render(DayGroup, { day: TODAY, now: TODAY });
    expect(container.querySelector('h3').textContent).toContain('Thu Sep 10');
  });

  it('carries the weekday in the date when the name is a relative one', () => {
    const { container } = render(DayGroup, { day: '2026-09-11T18:00:00-05:00', now: TODAY });
    expect(container.querySelector('.dh b').textContent).toBe('Tomorrow');
    expect(container.querySelector('.dh time').textContent).toBe('Fri Sep 11');
  });

  it('holds the rows that belong to it', () => {
    const { container } = render(DayGroup, { day: TODAY, now: TODAY });
    expect(container.querySelectorAll('.day > *').length).toBe(2);
  });
});
