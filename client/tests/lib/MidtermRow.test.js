import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import MidtermRow from '../../src/lib/MidtermRow.svelte';

const base = {
  midterm_id: 1,
  title: 'ECE 210 Midterm 1',
  course_code: 'ECE 210',
  course_title: 'Analog Signal Processing',
  start_time: '2026-10-01 19:00:00',
  status: 'upcoming',
  building: null,
  room_number: null,
  location_text: null,
};

describe('MidtermRow location', () => {
  it('shows the room when the midterm is in one', () => {
    const { getByText } = render(MidtermRow, {
      midterm: { ...base, building: 'Everitt Laboratory', room_number: '2310' },
    });
    expect(getByText(/Everitt Laboratory 2310/)).toBeTruthy();
  });

  it('shows the free text when there is no room', () => {
    const { getByText } = render(MidtermRow, { midterm: { ...base, location_text: 'Conflict exam room' } });
    expect(getByText(/Conflict exam room/)).toBeTruthy();
  });

  it('says the location is undecided when there is neither', () => {
    const { getByText } = render(MidtermRow, { midterm: base });
    expect(getByText(/Location to be announced/)).toBeTruthy();
  });
});

/** An exam listing that shows the wrong hour is worse than no listing at all. */
describe('MidtermRow shows campus time', () => {
  it('shows the hour the exam starts on campus', () => {
    const { getByText } = render(MidtermRow, {
      midterm: { ...base, start_time: '2026-10-01T19:00:00-05:00' },
    });
    expect(getByText(/Thu, Oct 1 at 7:00 PM/)).toBeTruthy();
  });

  it('shows the same hour to a reader in another zone', () => {
    const { getByText } = render(MidtermRow, {
      midterm: { ...base, start_time: '2026-10-02T09:00:00+09:00' },
    });
    expect(getByText(/Thu, Oct 1 at 7:00 PM/)).toBeTruthy();
  });
});

/**
 * Deleting is offered to global admins and to anyone on an RSO board. A board
 * member cannot reach the admin page at all, so for them the control has to be
 * here, on the schedule itself.
 */
describe('MidtermRow delete', () => {
  it('offers nothing to a reader who may not delete', () => {
    const { queryByRole } = render(MidtermRow, { midterm: base });
    expect(queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('offers a delete control to someone who may', () => {
    const { getByRole } = render(MidtermRow, { props: { midterm: base, canDelete: true } });
    expect(getByRole('button', { name: /delete/i })).toBeTruthy();
  });

  /** Deleting is offered behind a confirmation, as it is for an RSO. */
  function deletable() {
    const deleted = vi.fn();
    const rendered = render(MidtermRow, {
      props: { midterm: base, canDelete: true },
      events: { delete: deleted },
    });
    return { ...rendered, deleted };
  }

  it('asks before it deletes, rather than acting on the first click', async () => {
    const { getByRole, deleted } = deletable();
    await fireEvent.click(getByRole('button', { name: /^delete$/i }));
    expect(deleted).not.toHaveBeenCalled();
    expect(getByRole('button', { name: /yes, delete/i })).toBeTruthy();
  });

  it('reports the midterm to delete once it is confirmed', async () => {
    const { getByRole, deleted } = deletable();
    await fireEvent.click(getByRole('button', { name: /^delete$/i }));
    await fireEvent.click(getByRole('button', { name: /yes, delete/i }));
    expect(deleted).toHaveBeenCalled();
    expect(deleted.mock.calls[0][0].detail).toEqual({ midterm_id: 1 });
  });

  it('lets the question be dismissed without deleting', async () => {
    const { getByRole, queryByRole, deleted } = deletable();
    await fireEvent.click(getByRole('button', { name: /^delete$/i }));
    await fireEvent.click(getByRole('button', { name: /cancel/i }));
    expect(deleted).not.toHaveBeenCalled();
    expect(queryByRole('button', { name: /yes, delete/i })).toBeNull();
  });
});
