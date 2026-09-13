import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

const submitBugReport = vi.hoisted(() => vi.fn());
vi.mock('../../src/api/bugReports.js', () => ({
  submitBugReport, getBugReports: vi.fn(), setBugReportStatus: vi.fn(),
}));

const BugReportForm = (await import('../../src/lib/BugReportForm.svelte')).default;

beforeEach(() => {
  vi.clearAllMocks();
  submitBugReport.mockResolvedValue({ report_id: 42 });
  history.replaceState(null, '', '/calendar');
});

/**
 * Reporting something broken.
 *
 * The only way to say that something was wrong with VIA was to write to the
 * address on the About page, and most people do not write an email about a
 * button.
 */
describe('BugReportForm', () => {
  const fill = async ({ getByLabelText }, summary = 'The last week of September is empty') => {
    await fireEvent.change(getByLabelText(/what is it about/i), { target: { value: 'Calendar' } });
    await fireEvent.input(getByLabelText(/what went wrong/i), { target: { value: summary } });
  };

  it('sends what was written, with the page it was written from', async () => {
    const rendered = render(BugReportForm);
    await fill(rendered);
    await fireEvent.click(rendered.getByRole('button', { name: /Send report/i }));
    await waitFor(() => expect(submitBugReport).toHaveBeenCalled());
    expect(submitBugReport.mock.calls[0][0]).toMatchObject({
      area: 'Calendar',
      summary: 'The last week of September is empty',
      page: '/calendar',
    });
  });

  it('will not send without a summary of what went wrong', async () => {
    const { getByRole } = render(BugReportForm);
    await fireEvent.click(getByRole('button', { name: /Send report/i }));
    expect(submitBugReport).not.toHaveBeenCalled();
  });

  it('thanks the reporter rather than leaving the form as it was', async () => {
    const rendered = render(BugReportForm);
    await fill(rendered);
    await fireEvent.click(rendered.getByRole('button', { name: /Send report/i }));
    expect(await rendered.findByText(/Thank you/i)).toBeTruthy();
  });

  it('lets the reporter send a second one, on an empty form', async () => {
    const rendered = render(BugReportForm);
    await fill(rendered);
    await fireEvent.click(rendered.getByRole('button', { name: /Send report/i }));
    await fireEvent.click(await rendered.findByRole('button', { name: /Report something else/i }));
    const summary = await rendered.findByLabelText(/what went wrong/i);
    expect(summary.value).toBe('');
  });

  it('says an address to reply to is optional, and sends it when given', async () => {
    const rendered = render(BugReportForm);
    await fill(rendered);
    await fireEvent.input(rendered.getByLabelText(/how to reach you/i), {
      target: { value: 'jdoe2@illinois.edu' },
    });
    await fireEvent.click(rendered.getByRole('button', { name: /Send report/i }));
    await waitFor(() => expect(submitBugReport).toHaveBeenCalled());
    expect(submitBugReport.mock.calls[0][0].contact).toBe('jdoe2@illinois.edu');
  });

  /**
   * An error is a sentence in danger text under the thing that failed, never a
   * red box. See docs/design/08-surfaces.md.
   */
  it('says what went wrong rather than failing quietly, in a sentence', async () => {
    submitBugReport.mockRejectedValue(new Error('VIA is busy. Please try again shortly.'));
    const rendered = render(BugReportForm);
    await fill(rendered);
    await fireEvent.click(rendered.getByRole('button', { name: /Send report/i }));
    const said = await rendered.findByText(/VIA is busy/);
    expect(said.tagName).toBe('P');
    expect(said.getAttribute('style') ?? '').not.toMatch(/border|background/);
  });

  /**
   * About sets the page title, so the form carries no heading of its own, and
   * the one primary button on that screen is the one that sends the report.
   */
  it('carries no heading of its own, and one primary button', () => {
    const { container } = render(BugReportForm);
    expect(container.querySelector('h1')).toBe(null);
    expect(container.querySelectorAll('.btn.primary').length).toBe(1);
  });

  /** Every field is the design system's field, which has no box around it. */
  it('draws its fields as fields, each with a label joined to its control', () => {
    const { container, getByLabelText } = render(BugReportForm);
    expect(container.querySelectorAll('.fld').length).toBe(5);
    for (const name of [/what is it about/i, /what went wrong/i, /anything else/i, /which page/i, /how to reach you/i]) {
      expect(getByLabelText(name)).toBeTruthy();
    }
  });
});
