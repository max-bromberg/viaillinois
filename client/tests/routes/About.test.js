import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';

vi.mock('../../src/api/bugReports.js', () => ({
  submitBugReport: vi.fn(), getBugReports: vi.fn(), setBugReportStatus: vi.fn(),
}));
vi.mock('../../src/lib/updates.js', () => ({
  // The module publishes them newest first, which is the order About draws.
  allUpdates: [
    { slug: 'repeats', title: 'Events can repeat', date: '2026-09-02', summary: 'Weekly meetings.' },
    { slug: 'welcome', title: 'Welcome to VIA', date: '2026-04-23', summary: 'The first one.' },
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

  /** The page title is the one first level heading, and it names the tab. */
  it('titles the page for whichever of the three is open', async () => {
    navigate('/about/updates');
    const updates = render(About);
    expect(updates.getByRole('heading', { name: 'Updates', level: 1 })).toBeTruthy();
    updates.unmount();

    navigate('/about/report');
    const report = render(About);
    expect(report.getByRole('heading', { name: 'Report a bug', level: 1 })).toBeTruthy();
  });

  it('says which of the three is open, and only that one', async () => {
    const { getAllByRole, getByRole } = render(About);
    const open = getAllByRole('tab').filter(tab => tab.getAttribute('aria-selected') === 'true');
    expect(open.map(tab => tab.textContent.trim())).toEqual(['About VIA']);
    await fireEvent.click(getByRole('tab', { name: 'Updates' }));
    await waitFor(() => {
      expect(getAllByRole('tab').filter(t => t.getAttribute('aria-selected') === 'true')
        .map(t => t.textContent.trim())).toEqual(['Updates']);
    });
  });

  /** Dates are set in the data face, on the campus clock. */
  it('dates each update in mono, on the campus clock', async () => {
    navigate('/about/updates');
    const { container, findByText } = render(About);
    await findByText('Events can repeat');
    const date = container.querySelector('time');
    expect(date.textContent).toBe('Sep 2, 2026');
    expect(date.classList.contains('mono')).toBe(true);
  });

  /**
   * The review checklist in docs/design/11-implementation.md: no tile with a
   * border round it, no caption in uppercase, and the jargon a first year would
   * not know is written out in full.
   */
  it('carries no bordered tiles, no shouting and no jargon', () => {
    const { container } = render(About);
    expect(container.innerHTML).not.toMatch(/uppercase|rounded-lg|bg-card|shadow/);
    expect(container.textContent).not.toMatch(/\bRSOs?\b/);
  });
});
