import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { MonthCalendar } from '../../../src/lib/components/ui/index.js';
import { borrowedIn, globalRoots } from '../../support/designClasses.js';

/**
 * One month of days, which is the part every date control on the site is built
 * from.
 *
 * There were two calendars before this, one inside the date field and one
 * inside the picker that takes a set of dates, and they were the same hundred
 * and twenty lines of markup and stylesheet written out twice. Neither was in
 * the design system, so neither was held to it, and both named their elements
 * with the design system's own short words and were handed the declarations
 * those words carry. The calendar is a part of the design system now, and both
 * controls are arrangements of this one component.
 */
const SEPTEMBER = { year: 2026, month: 8, today: '2026-09-16' };

const draw = (props = {}) => render(MonthCalendar, { props: { ...SEPTEMBER, ...props } });

describe('MonthCalendar', () => {
  it('says which month it is showing', () => {
    expect(draw().getByText('September 2026')).toBeTruthy();
  });

  it('draws every day of the month and none of the next', () => {
    const { getByRole, queryByRole } = draw();
    expect(getByRole('button', { name: 'September 1, 2026' })).toBeTruthy();
    expect(getByRole('button', { name: 'September 30, 2026' })).toBeTruthy();
    expect(queryByRole('button', { name: 'September 31, 2026' })).toBe(null);
  });

  it('starts each month on the weekday it really starts on', () => {
    // The first of September 2026 is a Tuesday, so the first week has two
    // blanks before it. A calendar that gets this wrong is a calendar that
    // tells somebody the wrong day of the week for their event.
    const { container } = draw();
    const first = container.querySelectorAll('.cal .wkrow')[1];
    const cells = first.querySelectorAll('[role="gridcell"]');
    expect(cells[0].querySelector('button')).toBe(null);
    expect(cells[1].querySelector('button')).toBe(null);
    expect(cells[2].querySelector('button').textContent.trim()).toBe('1');
  });

  it('tells its parent which day was chosen', async () => {
    const chosen = vi.fn();
    const { getByRole } = render(MonthCalendar, { props: SEPTEMBER, events: { choose: chosen } });
    await fireEvent.click(getByRole('button', { name: 'September 15, 2026' }));
    expect(chosen.mock.calls[0][0].detail).toBe('2026-09-15');
  });

  it('marks the days it was given as chosen', () => {
    const { getByRole } = draw({ selected: ['2026-09-15'] });
    expect(getByRole('button', { name: 'September 15, 2026' }).getAttribute('aria-pressed')).toBe('true');
    expect(getByRole('button', { name: 'September 16, 2026' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('marks today, so the month has a place a reader can start from', () => {
    const { getByRole } = draw();
    expect(getByRole('button', { name: 'September 16, 2026' }).classList.contains('now')).toBe(true);
    expect(getByRole('button', { name: 'September 15, 2026' }).classList.contains('now')).toBe(false);
  });

  it('asks its parent to move the month rather than moving itself', async () => {
    const moved = vi.fn();
    const { getByRole } = render(MonthCalendar, { props: SEPTEMBER, events: { view: moved } });
    await fireEvent.click(getByRole('button', { name: 'Next month' }));
    expect(moved.mock.calls[0][0].detail).toEqual({ year: 2026, month: 9 });
    await fireEvent.click(getByRole('button', { name: 'Previous month' }));
    expect(moved.mock.calls[1][0].detail).toEqual({ year: 2026, month: 7 });
  });

  it('turns the year over at the ends of it', async () => {
    const moved = vi.fn();
    const { getByRole } = render(MonthCalendar, {
      props: { year: 2026, month: 11, today: '2026-12-01' },
      events: { view: moved },
    });
    await fireEvent.click(getByRole('button', { name: 'Next month' }));
    expect(moved.mock.calls[0][0].detail).toEqual({ year: 2027, month: 0 });
  });

  it('refuses a day outside the range it was given', async () => {
    const chosen = vi.fn();
    const { getByRole } = render(MonthCalendar, {
      props: { ...SEPTEMBER, min: '2026-09-10', max: '2026-09-20' },
      events: { choose: chosen },
    });
    expect(getByRole('button', { name: 'September 3, 2026' }).disabled).toBe(true);
    expect(getByRole('button', { name: 'September 25, 2026' }).disabled).toBe(true);
    expect(getByRole('button', { name: 'September 15, 2026' }).disabled).toBe(false);
    await fireEvent.click(getByRole('button', { name: 'September 3, 2026' }));
    expect(chosen).not.toHaveBeenCalled();
  });
});

/**
 * A month is a grid, and a grid is walked with the arrow keys.
 *
 * Forty two buttons in the tab order is not keyboard support, it is forty two
 * presses of the tab key to reach the end of a month and another forty two to
 * leave it. One day of the month is in the tab order and the arrows move from
 * there, which is what every calendar a person has already used does.
 */
describe('MonthCalendar from the keyboard', () => {
  const tabbable = container => container.querySelector('.cal .dbtn[tabindex="0"]');

  it('puts one day in the tab order and no more', () => {
    const { container } = draw();
    expect(container.querySelectorAll('.cal .dbtn[tabindex="0"]').length).toBe(1);
    expect(container.querySelectorAll('.cal .dbtn[tabindex="-1"]').length).toBe(29);
  });

  it('starts on the chosen day when there is one', () => {
    const { container } = draw({ selected: ['2026-09-15'] });
    expect(tabbable(container).textContent.trim()).toBe('15');
  });

  it('starts on today when nothing is chosen yet', () => {
    const { container } = draw();
    expect(tabbable(container).textContent.trim()).toBe('16');
  });

  it('starts on the first day it will accept when neither is in view', () => {
    const { container } = draw({ year: 2026, month: 10, min: '2026-11-05' });
    expect(tabbable(container).textContent.trim()).toBe('5');
  });

  it('moves a day at a time with the left and right arrows', async () => {
    const { container, getByRole } = draw();
    const from = getByRole('button', { name: 'September 16, 2026' });
    await fireEvent.keyDown(from, { key: 'ArrowRight' });
    await waitFor(() => expect(tabbable(container).textContent.trim()).toBe('17'));
    await fireEvent.keyDown(tabbable(container), { key: 'ArrowLeft' });
    await waitFor(() => expect(tabbable(container).textContent.trim()).toBe('16'));
  });

  it('moves a week at a time with the up and down arrows', async () => {
    const { container, getByRole } = draw();
    await fireEvent.keyDown(getByRole('button', { name: 'September 16, 2026' }), { key: 'ArrowDown' });
    await waitFor(() => expect(tabbable(container).textContent.trim()).toBe('23'));
    await fireEvent.keyDown(tabbable(container), { key: 'ArrowUp' });
    await waitFor(() => expect(tabbable(container).textContent.trim()).toBe('16'));
  });

  it('moves to the ends of the week with home and end', async () => {
    const { container, getByRole } = draw();
    await fireEvent.keyDown(getByRole('button', { name: 'September 16, 2026' }), { key: 'Home' });
    await waitFor(() => expect(tabbable(container).textContent.trim()).toBe('13'));
    await fireEvent.keyDown(tabbable(container), { key: 'End' });
    await waitFor(() => expect(tabbable(container).textContent.trim()).toBe('19'));
  });

  it('asks for the next month when the arrows walk off the end of this one', async () => {
    const moved = vi.fn();
    const { getByRole } = render(MonthCalendar, {
      props: { ...SEPTEMBER, selected: ['2026-09-30'] },
      events: { view: moved },
    });
    await fireEvent.keyDown(getByRole('button', { name: 'September 30, 2026' }), { key: 'ArrowRight' });
    expect(moved.mock.calls[0][0].detail).toEqual({ year: 2026, month: 9 });
  });

  it('pages a month at a time with page up and page down', async () => {
    const moved = vi.fn();
    const { getByRole } = render(MonthCalendar, { props: SEPTEMBER, events: { view: moved } });
    await fireEvent.keyDown(getByRole('button', { name: 'September 16, 2026' }), { key: 'PageDown' });
    expect(moved.mock.calls[0][0].detail).toEqual({ year: 2026, month: 9 });
    await fireEvent.keyDown(getByRole('button', { name: 'September 16, 2026' }), { key: 'PageUp' });
    expect(moved.mock.calls[1][0].detail).toEqual({ year: 2026, month: 7 });
  });

  it('holds the focus inside the range rather than leaving it on a day it will refuse', async () => {
    const { container, getByRole } = draw({ min: '2026-09-16' });
    await fireEvent.keyDown(getByRole('button', { name: 'September 16, 2026' }), { key: 'ArrowLeft' });
    await waitFor(() => expect(tabbable(container).textContent.trim()).toBe('16'));
  });
});

/**
 * The grid says it is a grid, because a reader who cannot see it is told the
 * shape of what they are moving through rather than being handed a run of
 * forty two buttons with no arrangement.
 */
describe('MonthCalendar and assistive technology', () => {
  it('is a grid of weeks, with the weekday names as its column headings', () => {
    const { container } = draw({ label: 'Choose a date' });
    const grid = container.querySelector('[role="grid"]');
    expect(grid.getAttribute('aria-label')).toBe('Choose a date');
    expect(grid.querySelectorAll('[role="row"]').length).toBe(6);
    expect([...grid.querySelectorAll('[role="columnheader"]')].map(c => c.textContent.trim()))
      .toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
  });

  it('spells the weekday out for a reader who hears the column heading', () => {
    const { container } = draw();
    const headings = [...container.querySelectorAll('[role="columnheader"]')];
    expect(headings[0].getAttribute('aria-label')).toBe('Sunday');
    expect(headings[6].getAttribute('aria-label')).toBe('Saturday');
  });

  it('says the month it moved to rather than changing under a reader in silence', () => {
    const { container } = draw();
    expect(container.querySelector('[aria-live="polite"]').textContent.trim()).toBe('September 2026');
  });
});

/**
 * The calendar is the design system's now, so it is drawn with the names the
 * design system gives it and with no others. The check is the one the pager and
 * the picker already carry: a component that names an element with a word the
 * stylesheet claims is handed every declaration that word carries and never
 * mentions, which is how forty two day buttons ended up drawn as forty two two
 * column page grids.
 */
describe('MonthCalendar and the design system class names', () => {
  it('borrows nothing but the names the design system gives the calendar', () => {
    const { container } = draw({ selected: ['2026-09-15'] });
    const ours = new Set(['cal', 'mhead', 'mstep', 'wkrow', 'dcap', 'dbtn', 'pad']);
    expect(borrowedIn(container).filter(name => !ours.has(name))).toEqual([]);
  });

  it('is in the stylesheet under those names rather than in a component of its own', () => {
    // The whole point of moving it into the design system: a later change to
    // the calendar is a change to the reference stylesheet, reviewed like every
    // other part, rather than a change to a private block nobody reads.
    const roots = globalRoots();
    for (const name of ['cal', 'mhead', 'mstep', 'wkrow', 'dcap', 'dbtn']) {
      expect(roots.has(name), `the stylesheet does not claim .${name}`).toBe(true);
    }
  });
});
