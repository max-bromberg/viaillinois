import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

const getBugReports = vi.hoisted(() => vi.fn());
const setBugReportStatus = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/bugReports.js', () => ({
  getBugReports, setBugReportStatus, submitBugReport: vi.fn(),
}));
vi.mock('../../src/stores/ui.js', async importOriginal => ({ ...await importOriginal(), showToast }));

const BugReportList = (await import('../../src/lib/BugReportList.svelte')).default;

const REPORTS = [
  {
    report_id: 2, area: 'Calendar', summary: 'The last week of September is empty',
    detail: 'Our meeting is on the events page but not on the grid.',
    contact: 'jdoe2@illinois.edu', page: '/calendar', reported_by: 'jdoe2',
    status: 'Open', created_at: '2026-09-08T10:00:00-05:00',
  },
  {
    report_id: 1, area: 'Midterms', summary: 'Delete button is invisible',
    detail: null, contact: null, page: '/midterms', reported_by: null,
    status: 'Closed', created_at: '2026-09-01T09:00:00-05:00',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  getBugReports.mockResolvedValue({ reports: REPORTS });
  setBugReportStatus.mockResolvedValue({ ok: true });
});

describe('BugReportList', () => {
  it('lists what has been reported', async () => {
    const { findByText, getByText } = render(BugReportList);
    expect(await findByText('The last week of September is empty')).toBeTruthy();
    expect(getByText('Delete button is invisible')).toBeTruthy();
  });

  it('closes a report that has been dealt with, and reads the list again', async () => {
    const { findByRole } = render(BugReportList);
    await fireEvent.click(await findByRole('button', { name: /Close report 2/i }));
    await waitFor(() => expect(setBugReportStatus).toHaveBeenCalledWith(2, 'Closed'));
    await waitFor(() => expect(getBugReports.mock.calls.length).toBeGreaterThan(1));
  });

  it('reopens one that was closed too soon', async () => {
    const { findByRole } = render(BugReportList);
    await fireEvent.click(await findByRole('button', { name: /Reopen report 1/i }));
    await waitFor(() => expect(setBugReportStatus).toHaveBeenCalledWith(1, 'Open'));
  });

  /** The reports go into a spreadsheet, which is where this work is tracked. */
  it('offers the whole listing as a spreadsheet file', async () => {
    const { findByRole } = render(BugReportList);
    expect(await findByRole('button', { name: /Download as CSV/i })).toBeTruthy();
  });

  it('shows only the open ones when asked', async () => {
    const { findByRole, queryByText, getByText } = render(BugReportList);
    await fireEvent.click(await findByRole('button', { name: /Open only/i }));
    expect(getByText('The last week of September is empty')).toBeTruthy();
    await waitFor(() => expect(queryByText('Delete button is invisible')).toBeNull());
  });

  /** The filter is a toggle, so it reports whether it is on. */
  it('says whether it is showing only the open ones', async () => {
    const { findByRole } = render(BugReportList);
    const only = await findByRole('button', { name: /Open only/i });
    expect(only.getAttribute('aria-pressed')).toBe('false');
    await fireEvent.click(only);
    await waitFor(() => expect(only.getAttribute('aria-pressed')).toBe('true'));
  });

  /**
   * A status is a highlighter, not a filled pill, and the listing stands on
   * hairlines rather than inside a card with a shadow. See the review checklist
   * in docs/design/11-implementation.md.
   */
  it('draws a status as a highlight and the listing on hairlines', async () => {
    const { container, findByText } = render(BugReportList);
    await findByText('The last week of September is empty');
    const statuses = [...container.querySelectorAll('.hl')].map(node => node.textContent.trim());
    expect(statuses).toContain('Open');
    expect(statuses).toContain('Closed');
    expect(container.innerHTML).not.toMatch(/shadow|rounded-lg|bg-primary/);
  });

  /** A time is a time on campus, whatever zone the reader is in. */
  it('dates each report on the campus clock', async () => {
    const { container, findByText } = render(BugReportList);
    await findByText('The last week of September is empty');
    expect(container.textContent).toMatch(/Sep 8/);
    expect(container.textContent).toMatch(/10:00 AM/);
  });
});
