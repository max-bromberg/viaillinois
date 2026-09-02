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

/**
 * The listing behind this panel is stale the moment an import succeeds, so the
 * panel says when it has written something and the page reloads itself.
 */
describe('CalendarImport announces a finished import', () => {
  beforeEach(() => {
    importCalendar.mockReset();
    importCalendar.mockResolvedValue(PLAN);
  });

  it('says nothing while only previewing', async () => {
    const imported = vi.fn();
    const { getByLabelText, getByRole, findByText } = render(CalendarImport, {
      props: { kind: 'midterms' },
      events: { imported },
    });
    await pasteCalendar(getByLabelText);
    await fireEvent.click(getByRole('button', { name: /preview/i }));
    await findByText(/Weekly meeting/);
    expect(imported).not.toHaveBeenCalled();
  });

  it('reports what it wrote once the import is confirmed', async () => {
    const imported = vi.fn();
    const { getByLabelText, getByRole, findByText } = render(CalendarImport, {
      props: { kind: 'midterms' },
      events: { imported },
    });
    await pasteCalendar(getByLabelText);
    await fireEvent.click(getByRole('button', { name: /preview/i }));
    await findByText(/Weekly meeting/);

    importCalendar.mockResolvedValue({ created: 2, updated: 1, skipped: 0 });
    await fireEvent.click(getByRole('button', { name: /import 2 entries/i }));

    await waitFor(() => expect(imported).toHaveBeenCalled());
    expect(imported.mock.calls[0][0].detail).toMatchObject({ created: 2, updated: 1 });
  });

  it('says nothing when the import fails', async () => {
    const imported = vi.fn();
    const { getByLabelText, getByRole, findByText } = render(CalendarImport, {
      props: { kind: 'midterms' },
      events: { imported },
    });
    await pasteCalendar(getByLabelText);
    await fireEvent.click(getByRole('button', { name: /preview/i }));
    await findByText(/Weekly meeting/);

    importCalendar.mockRejectedValue(new Error('nope'));
    await fireEvent.click(getByRole('button', { name: /import 2 entries/i }));
    await findByText(/nope/);
    expect(imported).not.toHaveBeenCalled();
  });
});

/**
 * A file with a weekly meeting in it creates a term of events, and the preview
 * is where that has to be visible, before anything is written.
 */
describe('CalendarImport, previewing a repeating entry', () => {
  const REPEATING_PLAN = {
    entries: [
      {
        action: 'create', kind: 'series', title: 'Weekly meeting',
        start: '2026-09-01 18:00:00', location_text: null, location_match: null,
        recurrence: { interval_weeks: 1, days_of_week: 'Tue', ends_on: '2026-12-08' },
        occurrences: 15, creating: 15, updating: 0, removing: 0,
      },
      {
        action: 'create', kind: 'event', title: 'Monthly social',
        start: '2026-09-04 18:00:00', location_text: null, location_match: null,
        repeats: 'not expanded',
      },
    ],
    skipped: 0,
    notExpanded: 1,
  };

  it('says how many events a repeating entry would create', async () => {
    importCalendar.mockResolvedValue(REPEATING_PLAN);
    const { getByLabelText, getByRole, findByText } = render(CalendarImport, { kind: 'events', rsoId: 1 });
    await pasteCalendar(getByLabelText);
    await fireEvent.click(getByRole('button', { name: /preview/i }));
    expect(await findByText('Repeats every Tuesday until December 8, 15 events')).toBeTruthy();
  });

  it('says which rules it will not expand, rather than leaving it to be found later', async () => {
    importCalendar.mockResolvedValue(REPEATING_PLAN);
    const { getByLabelText, getByRole, findByText } = render(CalendarImport, { kind: 'events', rsoId: 1 });
    await pasteCalendar(getByLabelText);
    await fireEvent.click(getByRole('button', { name: /preview/i }));
    expect(await findByText(/1 repeating entry uses a rule VIA does not expand/)).toBeTruthy();
  });

  it('says what a second import of the same file would change', async () => {
    importCalendar.mockResolvedValue({
      entries: [{
        action: 'update', kind: 'series', title: 'Weekly meeting',
        start: '2026-09-01 18:00:00', location_text: null, location_match: null,
        recurrence: { interval_weeks: 1, days_of_week: 'Tue', ends_on: '2026-12-08' },
        occurrences: 15, creating: 2, updating: 13, removing: 1,
      }],
      skipped: 0,
    });
    const { getByLabelText, getByRole, findByText } = render(CalendarImport, { kind: 'events', rsoId: 1 });
    await pasteCalendar(getByLabelText);
    await fireEvent.click(getByRole('button', { name: /preview/i }));
    expect(await findByText(/2 added, 13 updated, 1 removed/)).toBeTruthy();
  });
});
