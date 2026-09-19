import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { borrowedIn } from '../support/designClasses.js';

const DatePicker = (await import('../../src/lib/DatePicker.svelte')).default;

/**
 * One date, taken from a field that opens a calendar.
 *
 * The field is a line with a pad at its start, which is the shape the design
 * gives every field on the site, and the calendar that drops out of it is the
 * design system's own month. What is left here is the part that belongs to this
 * control rather than to the calendar: when the sheet opens, when it closes,
 * and where the focus goes when it does.
 */
describe('DatePicker', () => {
  const open = async (props = {}) => {
    const view = render(DatePicker, { props });
    await fireEvent.click(view.getByRole('button', { name: props.label ?? 'Pick a date' }));
    return view;
  };

  it('says what is in it, or offers the words to fill it with', () => {
    const { getByText } = render(DatePicker, { props: { value: '2026-09-15' } });
    expect(getByText('Sep 15, 2026')).toBeTruthy();
  });

  it('reads a day as a day on campus rather than as an instant', () => {
    // Read as an instant a bare day is midnight in UTC, which is the evening
    // before in Urbana, and the field would say the day before the one chosen.
    const { getByText } = render(DatePicker, { props: { value: '2026-01-01' } });
    expect(getByText('Jan 1, 2026')).toBeTruthy();
  });

  it('keeps the calendar shut until it is asked for', async () => {
    const { queryByRole, getByRole } = render(DatePicker, { props: {} });
    expect(queryByRole('grid')).toBe(null);
    expect(getByRole('button', { name: 'Pick a date' }).getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(getByRole('button', { name: 'Pick a date' }));
    await waitFor(() => expect(queryByRole('grid')).toBeTruthy());
  });

  it('opens on the month the date it holds is in', async () => {
    const { getByText } = await open({ value: '2026-11-03' });
    await waitFor(() => expect(getByText('November 2026')).toBeTruthy());
  });

  it('takes the date the calendar reports, and shuts', async () => {
    const changed = vi.fn();
    const view = render(DatePicker, { props: { value: '2026-09-01' }, events: { change: changed } });
    await fireEvent.click(view.getByRole('button', { name: 'Pick a date' }));
    await fireEvent.click(await view.findByRole('button', { name: 'September 15, 2026' }));
    expect(changed.mock.calls[0][0].detail).toBe('2026-09-15');
    await waitFor(() => expect(view.queryByRole('grid')).toBe(null));
  });

  it('stays open while the month is paged, because paging is not choosing', async () => {
    const view = await open({ value: '2026-09-01' });
    await fireEvent.click(await view.findByRole('button', { name: 'Next month' }));
    await waitFor(() => expect(view.getByText('October 2026')).toBeTruthy());
    expect(view.queryByRole('grid')).toBeTruthy();
  });

  it('shuts on the escape key and hands the focus back to the field', async () => {
    const view = await open({ value: '2026-09-01' });
    await fireEvent.keyDown(view.getByRole('grid'), { key: 'Escape' });
    await waitFor(() => expect(view.queryByRole('grid')).toBe(null));
    expect(document.activeElement).toBe(view.getByRole('button', { name: 'Pick a date' }));
  });

  it('empties the field when it is asked to, and shuts', async () => {
    const changed = vi.fn();
    const view = render(DatePicker, { props: { value: '2026-09-15' }, events: { change: changed } });
    await fireEvent.click(view.getByRole('button', { name: 'Pick a date' }));
    await fireEvent.click(await view.findByRole('button', { name: 'Clear the date' }));
    expect(changed.mock.calls[0][0].detail).toBe('');
    await waitFor(() => expect(view.queryByRole('grid')).toBe(null));
  });

  it('offers nothing to clear when there is nothing in it', async () => {
    const view = await open({});
    await waitFor(() => expect(view.queryByRole('grid')).toBeTruthy());
    expect(view.queryByRole('button', { name: 'Clear the date' })).toBe(null);
  });

  it('carries the range it was given through to the calendar', async () => {
    const view = await open({ value: '2026-09-15', min: '2026-09-10' });
    const refused = await view.findByRole('button', { name: 'September 3, 2026' });
    expect(refused.disabled).toBe(true);
  });

  it('is named by whatever names it, for somebody who cannot see the words beside it', async () => {
    const { getByRole } = render(DatePicker, {
      props: { label: 'The first date', describedBy: 'help-text' },
    });
    const trigger = getByRole('button', { name: 'The first date' });
    expect(trigger.getAttribute('aria-describedby')).toBe('help-text');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('borrows nothing but the names the design system gives it', async () => {
    const { container } = await open({ value: '2026-09-15' });
    await waitFor(() => expect(container.querySelector('[role="grid"]')).toBeTruthy());
    const ours = new Set(['cal', 'mhead', 'mstep', 'wkrow', 'dcap', 'dbtn', 'pad', 'cut', 'fld', 'in', 'btn', 'quiet', 'sm']);
    expect(borrowedIn(container).filter(name => !ours.has(name))).toEqual([]);
  });
});
