import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/router.js', () => ({ navigate }));
vi.mock('../../src/lib/updates.js', () => ({
  allUpdates: [
    { slug: 'repeats', title: 'Events can repeat', date: '2026-09-02', summary: 'Weekly meetings.' },
    { slug: 'welcome', title: 'Welcome to VIA', date: '2026-04-23', summary: 'The first one.' },
  ],
  formatDate: date => date,
}));

const UpdatesWidget = (await import('../../src/lib/UpdatesWidget.svelte')).default;

/**
 * The widget sits beside the calendar. Its heading is a heading rather than a
 * caption in uppercase over the list, and its way through to the whole listing
 * has to lead where the listing actually is, which is inside About now.
 */
describe('UpdatesWidget', () => {
  it('links each update to its own page', () => {
    const { getByRole } = render(UpdatesWidget);
    expect(getByRole('link', { name: /Events can repeat/ }).getAttribute('href')).toBe('/updates/repeats');
  });

  it('leads to the whole listing where the listing now lives', () => {
    const { getByRole } = render(UpdatesWidget);
    expect(getByRole('link', { name: /All updates/i }).getAttribute('href')).toBe('/about/updates');
  });

  it('follows an update without reloading the page', async () => {
    const { getByRole } = render(UpdatesWidget);
    await fireEvent.click(getByRole('link', { name: /Events can repeat/ }));
    expect(navigate).toHaveBeenCalledWith('/updates/repeats');
  });

  it('names itself with a heading rather than a caption in uppercase', () => {
    const { getByRole, container } = render(UpdatesWidget);
    expect(getByRole('heading', { name: 'Updates' })).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/uppercase/);
  });

  /** A date is a date on campus, and dates are set in the data face. */
  it('dates each update on the campus clock, in mono', () => {
    const { container } = render(UpdatesWidget);
    const date = container.querySelector('time');
    expect(date.textContent).toBe('Sep 2, 2026');
    expect(date.classList.contains('mono')).toBe(true);
    expect(date.getAttribute('datetime')).toBe('2026-09-02');
  });
});
