import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

const importCalendar = vi.fn();
vi.mock('../../src/api/calendar.js', () => ({ importCalendar: (...a) => importCalendar(...a) }));

const CalendarImport = (await import('../../src/lib/CalendarImport.svelte')).default;

const ICS = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nEND:VEVENT\r\nEND:VCALENDAR';
// A textarea normalises CRLF to LF, so what reaches the API has unix line
// endings even though the calendar format specifies CRLF. The parser accepts
// both, which is the reason that is only an observation and not a bug.
const SENT = ICS.replace(/\r\n/g, '\n');

const PLAN = {
  entries: [
    { action: 'create', title: 'Weekly meeting', start: '2026-10-01 18:00:00', location_text: 'ECEB 1002', location_match: 'Electrical & Computer Eng Bldg 1002' },
    { action: 'update', title: 'Industry panel', start: '2026-10-08 18:00:00', location_text: 'Zoom', location_match: null },
  ],
  skipped: 1,
};

async function pasteCalendar(getByLabelText, text = ICS) {
  const box = getByLabelText(/calendar/i);
  await fireEvent.input(box, { target: { value: text } });
  return box;
}

describe('CalendarImport', () => {
  beforeEach(() => {
    importCalendar.mockReset();
    importCalendar.mockResolvedValue(PLAN);
  });

  it('previews before importing anything', async () => {
    const { getByLabelText, getByRole } = render(CalendarImport, { kind: 'events', rsoId: 1 });
    await pasteCalendar(getByLabelText);
    await fireEvent.click(getByRole('button', { name: /preview/i }));

    await waitFor(() => expect(importCalendar).toHaveBeenCalledWith({
      kind: 'events', rsoId: 1, ics: SENT, preview: true,
    }));
  });

  it('lists what the file would do', async () => {
    const { getByLabelText, getByRole, findByText } = render(CalendarImport, { kind: 'events', rsoId: 1 });
    await pasteCalendar(getByLabelText);
    await fireEvent.click(getByRole('button', { name: /preview/i }));

    expect(await findByText(/Weekly meeting/)).toBeTruthy();
    expect(await findByText(/Industry panel/)).toBeTruthy();
  });

  /** An admin has to be able to see a wrong room before it lands, not after. */
  it('shows which room each entry resolved to', async () => {
    const { getByLabelText, getByRole, findByText } = render(CalendarImport, { kind: 'events', rsoId: 1 });
    await pasteCalendar(getByLabelText);
    await fireEvent.click(getByRole('button', { name: /preview/i }));

    expect(await findByText(/Electrical & Computer Eng Bldg 1002/)).toBeTruthy();
    expect(await findByText(/kept as written/i)).toBeTruthy();
  });

  it('says how many entries it could not read', async () => {
    const { getByLabelText, getByRole, findByText } = render(CalendarImport, { kind: 'events', rsoId: 1 });
    await pasteCalendar(getByLabelText);
    await fireEvent.click(getByRole('button', { name: /preview/i }));
    expect(await findByText(/1 entry could not be read/i)).toBeTruthy();
  });

  /**
   * A calendar can name the same entry twice, and the importer keeps the
   * first. Saying so is the difference between a count that looks wrong and a
   * count that is explained.
   */
  it('says when the file named an entry more than once', async () => {
    importCalendar.mockResolvedValue({ ...PLAN, duplicates: 2 });
    const { getByLabelText, getByRole, findByText } = render(CalendarImport, { kind: 'events', rsoId: 1 });
    await pasteCalendar(getByLabelText);
    await fireEvent.click(getByRole('button', { name: /preview/i }));
    expect(await findByText(/2 entries appear more than once/i)).toBeTruthy();
  });

  it('imports only after the preview is confirmed', async () => {
    const { getByLabelText, getByRole, findByText } = render(CalendarImport, { kind: 'events', rsoId: 1 });
    await pasteCalendar(getByLabelText);
    await fireEvent.click(getByRole('button', { name: /preview/i }));
    await findByText(/Weekly meeting/);

    importCalendar.mockResolvedValue({ created: 1, updated: 1, skipped: 1 });
    await fireEvent.click(getByRole('button', { name: /import 2 entries/i }));

    await waitFor(() => expect(importCalendar).toHaveBeenLastCalledWith({
      kind: 'events', rsoId: 1, ics: SENT, preview: false,
    }));
  });

  it('reports what it did', async () => {
    const { getByLabelText, getByRole, findByText } = render(CalendarImport, { kind: 'events', rsoId: 1 });
    await pasteCalendar(getByLabelText);
    await fireEvent.click(getByRole('button', { name: /preview/i }));
    await findByText(/Weekly meeting/);

    importCalendar.mockResolvedValue({ created: 1, updated: 1, skipped: 0 });
    await fireEvent.click(getByRole('button', { name: /import 2 entries/i }));
    expect(await findByText(/1 added, 1 updated/)).toBeTruthy();
  });

  it('shows the error when the file is not a calendar', async () => {
    importCalendar.mockRejectedValue(new Error('That file has no calendar entries in it.'));
    const { getByLabelText, getByRole, findByText } = render(CalendarImport, { kind: 'events', rsoId: 1 });
    await pasteCalendar(getByLabelText, 'nonsense');
    await fireEvent.click(getByRole('button', { name: /preview/i }));
    expect(await findByText(/no calendar entries/i)).toBeTruthy();
  });

  it('will not preview an empty box', async () => {
    const { getByRole } = render(CalendarImport, { kind: 'events', rsoId: 1 });
    await fireEvent.click(getByRole('button', { name: /preview/i }));
    expect(importCalendar).not.toHaveBeenCalled();
  });

  /** The midterm importer reports courses it could not place. */
  it('lists titles whose course it could not match', async () => {
    importCalendar.mockResolvedValue({ entries: [], skipped: 0, unmatched: ['Reading day'] });
    const { getByLabelText, getByRole, findByText } = render(CalendarImport, { kind: 'midterms' });
    await pasteCalendar(getByLabelText);
    await fireEvent.click(getByRole('button', { name: /preview/i }));
    expect(await findByText(/Reading day/)).toBeTruthy();
  });
});
