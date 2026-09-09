import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';

vi.mock('../../src/api/bugReports.js', () => ({
  submitBugReport: vi.fn(), getBugReports: vi.fn(), setBugReportStatus: vi.fn(),
}));
vi.mock('../../src/lib/updates.js', () => ({
  // The module publishes them newest first, which is the order About draws.
  allUpdates: [
    { slug: 'repeats', title: 'Events can repeat', date: '2026-09-02', summary: 'Weekly meetings.', body: '' },
    { slug: 'welcome', title: 'Welcome to VIA', date: '2026-04-23', summary: 'The first one.', body: '' },
  ],
  formatDate: date => date,
}));

const { currentPath, routeParams, navigate } = await import('../../src/lib/router.js');
const About = (await import('../../src/routes/About.svelte')).default;

beforeEach(() => {
  navigate('/about');
});

/**
 * Updates were a page of their own in the navigation, beside About, which put
 * two entries there for one thing a reader looks at rarely. They are a part of
 * About now, and the addresses they had still work.
 */
describe('About', () => {
  it('opens on what VIA is', async () => {
    const { getByRole } = render(About);
    expect(getByRole('heading', { name: 'About VIA', level: 1 })).toBeTruthy();
  });

  it('offers the updates alongside it', async () => {
    const { getByRole, findByText } = render(About);
    await fireEvent.click(getByRole('tab', { name: 'Updates' }));
    expect(await findByText('Events can repeat')).toBeTruthy();
  });

  it('draws them in the order the platform publishes them', async () => {
    const { getByRole, container } = render(About);
    await fireEvent.click(getByRole('tab', { name: 'Updates' }));
    const headings = [...container.querySelectorAll('h2')].map(h => h.textContent.trim());
    expect(headings.indexOf('Events can repeat')).toBeLessThan(headings.indexOf('Welcome to VIA'));
  });

  it('gives the updates an address of their own, so one can be linked to', async () => {
    const { getByRole } = render(About);
    await fireEvent.click(getByRole('tab', { name: 'Updates' }));
    await waitFor(() => expect(get(currentPath)).toBe('/about/updates'));
  });

  it('opens on the updates when that is the address asked for', async () => {
    navigate('/about/updates');
    const { findByText } = render(About);
    expect(await findByText('Events can repeat')).toBeTruthy();
  });

  it('offers a way to report something broken', async () => {
    const { getByRole, findByRole } = render(About);
    await fireEvent.click(getByRole('tab', { name: 'Report a bug' }));
    expect(await findByRole('button', { name: /Send report/i })).toBeTruthy();
    await waitFor(() => expect(get(currentPath)).toBe('/about/report'));
  });

  it('still links each update to the page it has always had', async () => {
    navigate('/about/updates');
    const { findByRole } = render(About);
    const link = await findByRole('link', { name: /Events can repeat/ });
    expect(link.getAttribute('href')).toBe('/updates/repeats');
  });
});
