import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/router.js', () => ({ navigate }));

const getUpdate = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/updates.js', () => ({ getUpdate, allUpdates: [], formatDate: d => d }));

const UpdateDetail = (await import('../../src/routes/UpdateDetail.svelte')).default;

beforeEach(() => {
  vi.clearAllMocks();
  getUpdate.mockReturnValue({
    slug: 'repeats',
    title: 'Events can repeat',
    date: '2026-09-02',
    summary: 'Weekly meetings are one event now.',
    body: '## What changed\n\nA weekly meeting is filed once.\n\n- One entry on the feed\n',
  });
});

/**
 * One update, as a page of its own. It is a reading page: the title, the day it
 * was published, and the prose.
 */
describe('an update', () => {
  it('sets the update title as the page title', () => {
    const { getByRole } = render(UpdateDetail, { slug: 'repeats' });
    expect(getByRole('heading', { name: 'Events can repeat', level: 1 })).toBeTruthy();
  });

  /**
   * VIA serves one campus, so the day an update was published is the day it was
   * published on campus. Read as an instant, a plain date is midnight in UTC,
   * which is the evening before on campus.
   */
  it('dates it on the campus clock, in mono', () => {
    const { container } = render(UpdateDetail, { slug: 'repeats' });
    const dateline = container.querySelector('.dateline');
    expect(dateline.textContent).toBe('Sep 2, 2026');
    expect(dateline.classList.contains('mono')).toBe(true);
  });

  it('draws the body of the update', async () => {
    const { findByRole, container } = render(UpdateDetail, { slug: 'repeats' });
    expect(await findByRole('heading', { name: 'What changed', level: 2 })).toBeTruthy();
    await waitFor(() => expect(container.textContent).toContain('A weekly meeting is filed once.'));
  });

  it('leads back to the whole listing without reloading the page', async () => {
    const { getByRole } = render(UpdateDetail, { slug: 'repeats' });
    const back = getByRole('link', { name: /all updates/i });
    expect(back.getAttribute('href')).toBe('/updates');
    await fireEvent.click(back);
    expect(navigate).toHaveBeenCalledWith('/updates');
  });

  /**
   * An address that names no update says what is there instead of drawing an
   * empty document, and says where the rest of them are.
   */
  it('says so when there is no such update, and says where the others are', () => {
    getUpdate.mockReturnValue(null);
    const { container, getByRole } = render(UpdateDetail, { slug: 'nothing-here' });
    expect(container.textContent).toMatch(/no update at this address/i);
    expect(getByRole('link', { name: /all updates/i })).toBeTruthy();
  });
});
