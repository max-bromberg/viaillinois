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
vi.mock('../../src/stores/ui.js', () => ({ showToast }));

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
