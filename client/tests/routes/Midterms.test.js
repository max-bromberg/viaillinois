import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

const getMidterms = vi.hoisted(() => vi.fn());
const deleteMidterm = vi.hoisted(() => vi.fn());
const deleteMidterms = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/midterms.js', () => ({
  getMidterms, createMidterm: vi.fn(), deleteMidterm, deleteMidterms,
}));
vi.mock('../../src/api/locations.js', () => ({ searchLocations: vi.fn().mockResolvedValue({ locations: [] }) }));
vi.mock('../../src/api/calendar.js', () => ({ importCalendar: vi.fn() }));
vi.mock('../../src/api/semester.js', () => ({
  getCurrentSemester: vi.fn().mockResolvedValue({
    semester: {
      code: '2026fa', label: 'Fall 2026',
      instruction_start: '2026-08-24', instruction_end: '2026-10-19', breaks: [],
    },
  }),
}));
vi.mock('../../src/stores/ui.js', async importOriginal => ({ ...await importOriginal(), showToast }));

const USER = { net_id: 'boardmember', memberships: [{ rso_id: 1, role: 'Board' }] };
vi.mock('../../src/stores/auth.js', () => ({
  currentUser:   { subscribe: fn => { fn(USER); return () => {}; } },
  isGlobalAdmin: { subscribe: fn => { fn(false); return () => {}; } },
  isRsoAdmin:    { subscribe: fn => { fn(true); return () => {}; } },
}));

const Midterms = (await import('../../src/routes/Midterms.svelte')).default;

const exam = (id, code) => ({
  midterm_id: id, course_code: code, course_title: 'A course', title: 'Midterm 1',
  start_time: '2026-10-01 19:00:00', end_time: '2026-10-01 21:00:00', status: 'Confirmed',
  building: null, room_number: null, location_text: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  getMidterms.mockResolvedValue({ midterms: [exam(1, 'ECE 210'), exam(2, 'ECE 220'), exam(3, 'ECE 313')] });
  deleteMidterms.mockResolvedValue({ ok: true, deleted: 2 });
});

/**
 * Clearing several entries at once.
 *
 * A calendar imported under the wrong course codes leaves a page of entries to
 * take off the schedule, and taking them off one confirmation at a time is what
 * boards were doing.
 */
describe('Midterms, removing several at once', () => {
  const ticks = container => container.querySelectorAll('input[type="checkbox"][data-midterm-tick]');

  it('offers a tick against each entry to somebody who may remove them', async () => {
    const { container } = render(Midterms);
    await waitFor(() => expect(ticks(container).length).toBe(3));
  });

  it('says how many are chosen, and removes exactly those', async () => {
    const { container, getByRole, findByRole } = render(Midterms);
    await waitFor(() => expect(ticks(container).length).toBe(3));
    await fireEvent.click(ticks(container)[0]);
    await fireEvent.click(ticks(container)[2]);
    await fireEvent.click(await findByRole('button', { name: /Delete 2 chosen/i }));
    await fireEvent.click(getByRole('button', { name: /Yes, delete 2/i }));
    await waitFor(() => expect(deleteMidterms).toHaveBeenCalledWith([1, 3]));
  });

  it('asks before it removes them', async () => {
    const { container, findByRole } = render(Midterms);
    await waitFor(() => expect(ticks(container).length).toBe(3));
    await fireEvent.click(ticks(container)[0]);
    await fireEvent.click(await findByRole('button', { name: /Delete 1 chosen/i }));
    expect(deleteMidterms).not.toHaveBeenCalled();
  });

  it('chooses and unchooses every entry on the page at once', async () => {
    const { container, findByRole } = render(Midterms);
    await waitFor(() => expect(ticks(container).length).toBe(3));
    const all = container.querySelector('input[type="checkbox"][data-midterm-tick-all]');
    await fireEvent.click(all);
    expect(await findByRole('button', { name: /Delete 3 chosen/i })).toBeTruthy();
    await fireEvent.click(all);
    await waitFor(() => expect(container.textContent).not.toMatch(/Delete 3 chosen/));
  });

  it('reloads the schedule once they have gone', async () => {
    const { container, getByRole, findByRole } = render(Midterms);
    await waitFor(() => expect(ticks(container).length).toBe(3));
    await fireEvent.click(ticks(container)[0]);
    await fireEvent.click(await findByRole('button', { name: /Delete 1 chosen/i }));
    const before = getMidterms.mock.calls.length;
    await fireEvent.click(getByRole('button', { name: /Yes, delete 1/i }));
    await waitFor(() => expect(getMidterms.mock.calls.length).toBeGreaterThan(before));
  });
});

/**
 * The schedule as docs/design/08-surfaces.md sets it: the term name in the
 * title, the term as a ribbon of weeks, and the exams as a listing rather than
 * as a table.
 */
describe('Midterms, as the term', () => {
  it('heads the page with the term the platform is in', async () => {
    const { findByRole } = render(Midterms);
    const title = await findByRole('heading', { level: 1 });
    expect(title.textContent).toContain('Midterms');
    expect(title.textContent).toContain('Fall 2026');
  });

  it('draws the term as a ribbon, one cell to a week', async () => {
    const { container } = render(Midterms);
    await waitFor(() => expect(container.querySelectorAll('.ribbon .wkc').length).toBe(9));
  });

  it('warms the week the exams are in with the number of them', async () => {
    const { container } = render(Midterms);
    await waitFor(() => {
      const counts = [...container.querySelectorAll('.ribbon .wkc b')].map(cell => cell.textContent);
      expect(counts).toEqual(['0', '0', '0', '0', '0', '3', '0', '0', '0']);
    });
  });

  it('sets each exam as a row in a listing rather than as a table', async () => {
    const { container } = render(Midterms);
    await waitFor(() => expect(container.querySelectorAll('.exam').length).toBe(3));
    expect(container.querySelector('table')).toBeNull();
  });

  it('says the status as a highlighted word rather than as a filled pill', async () => {
    const { container } = render(Midterms);
    await waitFor(() => expect(container.querySelectorAll('.exam .hl').length).toBe(3));
  });

  it('draws icons rather than emoji', async () => {
    const { container } = render(Midterms);
    await waitFor(() => expect(container.querySelectorAll('.exam').length).toBe(3));
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

describe('Midterms, finding one', () => {
  it('narrows the listing to what was typed', async () => {
    const { container, getByPlaceholderText } = render(Midterms);
    await waitFor(() => expect(container.querySelectorAll('.exam').length).toBe(3));
    await fireEvent.input(getByPlaceholderText(/Course code or title/i), { target: { value: 'ECE 220' } });
    await waitFor(() => expect(container.querySelectorAll('.exam').length).toBe(1));
  });

  it('says what to do when nothing matches', async () => {
    const { container, getByPlaceholderText } = render(Midterms);
    await waitFor(() => expect(container.querySelectorAll('.exam').length).toBe(3));
    await fireEvent.input(getByPlaceholderText(/Course code or title/i), { target: { value: 'ECE 999' } });
    await waitFor(() => expect(container.querySelector('.empty')).toBeTruthy());
  });
});

describe('Midterms, ordering the schedule', () => {
  const codes = container => [...container.querySelectorAll('.exam .code')].map(c => c.textContent.slice(0, 7));

  it('orders by the word that is chosen, and turns it around when it is chosen again', async () => {
    const { container, getByRole } = render(Midterms);
    await waitFor(() => expect(container.querySelectorAll('.exam').length).toBe(3));
    const byExam = getByRole('button', { name: 'Exam' });
    await fireEvent.click(byExam);
    expect(byExam.getAttribute('aria-pressed')).toBe('true');
    expect(codes(container)).toEqual(['ECE 210', 'ECE 220', 'ECE 313']);
    await fireEvent.click(byExam);
    expect(codes(container)).toEqual(['ECE 313', 'ECE 220', 'ECE 210']);
  });
});

describe('Midterms, adding one', () => {
  it('opens the form in a dialog', async () => {
    const { findByRole, queryByRole } = render(Midterms);
    expect(queryByRole('dialog')).toBeNull();
    await fireEvent.click(await findByRole('button', { name: 'Add a midterm' }));
    const dialog = await findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('closes the dialog on the escape key', async () => {
    const { findByRole, queryByRole } = render(Midterms);
    await fireEvent.click(await findByRole('button', { name: 'Add a midterm' }));
    await findByRole('dialog');
    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(queryByRole('dialog')).toBeNull());
  });

  it('leaves one primary button on the screen while the dialog is open', async () => {
    const { container, findByRole } = render(Midterms);
    await fireEvent.click(await findByRole('button', { name: 'Add a midterm' }));
    await findByRole('dialog');
    expect(container.querySelectorAll('.btn.primary').length).toBe(1);
  });
});
