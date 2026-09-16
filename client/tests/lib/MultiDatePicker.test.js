import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

import { borrowedIn } from '../support/designClasses.js';

const MultiDatePicker = (await import('../../src/lib/MultiDatePicker.svelte')).default;

/**
 * Picking a set of dates that follow no rule.
 *
 * Some things an RSO holds are three evenings across a term with nothing in
 * common between them, and until now each of those was an event entered by
 * hand. This is the calendar the organizer clicks.
 */
describe('MultiDatePicker', () => {
  const openOn = (props = {}) =>
    render(MultiDatePicker, { props: { month: '2026-09', ...props } });

  it('draws the month it is pointed at', () => {
    const { getByText } = openOn();
    expect(getByText('September 2026')).toBeTruthy();
  });

  it('adds a date when its day is clicked', async () => {
    const chosen = vi.fn();
    const { getByRole } = render(MultiDatePicker, {
      props: { month: '2026-09', value: [] },
      events: { change: chosen },
    });
    await fireEvent.click(getByRole('button', { name: 'September 15, 2026' }));
    expect(chosen.mock.calls[0][0].detail).toEqual(['2026-09-15']);
  });

  it('takes a date away when its day is clicked again', async () => {
    const chosen = vi.fn();
    const { getByRole } = render(MultiDatePicker, {
      props: { month: '2026-09', value: ['2026-09-15'] },
      events: { change: chosen },
    });
    await fireEvent.click(getByRole('button', { name: 'September 15, 2026' }));
    expect(chosen.mock.calls[0][0].detail).toEqual([]);
  });

  it('keeps the dates in order however they were clicked', async () => {
    const chosen = vi.fn();
    const { getByRole } = render(MultiDatePicker, {
      props: { month: '2026-09', value: ['2026-09-20'] },
      events: { change: chosen },
    });
    await fireEvent.click(getByRole('button', { name: 'September 3, 2026' }));
    expect(chosen.mock.calls[0][0].detail).toEqual(['2026-09-03', '2026-09-20']);
  });

  it('marks the days already chosen, so a month can be read at a glance', () => {
    const { getByRole } = openOn({ value: ['2026-09-15'] });
    expect(getByRole('button', { name: 'September 15, 2026' }).getAttribute('aria-pressed')).toBe('true');
    expect(getByRole('button', { name: 'September 16, 2026' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('moves to another month without losing what was chosen in this one', async () => {
    const { getByRole, getByText } = openOn({ value: ['2026-09-15'] });
    await fireEvent.click(getByRole('button', { name: 'Next month' }));
    await waitFor(() => expect(getByText('October 2026')).toBeTruthy());
    expect(getByRole('button', { name: 'October 15, 2026' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('says how many are chosen, across every month', () => {
    const { getByText } = openOn({ value: ['2026-09-15', '2026-10-08'] });
    expect(getByText('2 dates chosen')).toBeTruthy();
  });

  it('will not choose a date before the one it is bounded at', async () => {
    const chosen = vi.fn();
    const { getByRole } = render(MultiDatePicker, {
      props: { month: '2026-09', value: [], min: '2026-09-10' },
      events: { change: chosen },
    });
    expect(getByRole('button', { name: 'September 3, 2026' }).disabled).toBe(true);
    await fireEvent.click(getByRole('button', { name: 'September 3, 2026' }));
    expect(chosen).not.toHaveBeenCalled();
  });
});

/**
 * The design system's class names are global, and they are short: .nav, .day,
 * .ev, .mt. Svelte scopes the rules a component writes, which raises their
 * specificity, and it does nothing at all to stop a global rule matching the
 * same class on the same element. So a component that names an element .day is
 * handed every declaration the feed's day header carries and the component
 * never mentions.
 *
 * That is what broke the calendar on the create event form. Global .day is a
 * two column grid of 118px and a fraction with 18px of padding, applied to
 * every one of the forty two day buttons inside a 268px wide seven column
 * calendar, and global .nav is 64px tall with 28px of side padding, applied to
 * the month stepper. The view did not merely look wrong, it had no usable
 * calendar in it.
 *
 * The answer was not to keep inventing private names for a calendar the design
 * system had no opinion about. The calendar is the design system's own now,
 * under .cal, so the names it carries are names somebody approved rather than
 * names it borrowed, and this check says which ones those are.
 */
describe('the calendar does not borrow the design system class names', () => {
  it('names no element with a class the stylesheet claims for something else', () => {
    const { container } = render(MultiDatePicker, { props: { month: '2026-09', value: [] } });
    const ours = new Set(['cal', 'mhead', 'mstep', 'wkrow', 'dcap', 'dbtn', 'pad', 'tally']);
    expect(borrowedIn(container).filter(name => !ours.has(name))).toEqual([]);
  });
});
