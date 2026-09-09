import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';

vi.mock('../../src/lib/router.js', () => ({ navigate: vi.fn() }));
vi.mock('../../src/lib/updates.js', () => ({
  allUpdates: [
    { slug: 'repeats', title: 'Events can repeat', date: '2026-09-02', summary: 'Weekly meetings.' },
    { slug: 'welcome', title: 'Welcome to VIA', date: '2026-04-23', summary: 'The first one.' },
  ],
  formatDate: date => date,
}));

const UpdatesWidget = (await import('../../src/lib/UpdatesWidget.svelte')).default;

/**
 * The widget sits beside the feed and the calendar. Its way through to the
 * whole listing has to lead where the listing actually is, which is inside
 * About now.
 */
describe('UpdatesWidget', () => {
  it('links each update to its own page', () => {
    const { getByRole } = render(UpdatesWidget);
    expect(getByRole('link', { name: /Events can repeat/ }).getAttribute('href')).toBe('/updates/repeats');
  });

  it('leads to the whole listing where the listing now lives', () => {
    const { getByRole } = render(UpdatesWidget);
    expect(getByRole('link', { name: /View all/ }).getAttribute('href')).toBe('/about/updates');
  });
});
