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
    expect(getByText(/Thu Oct 1, 7:00 PM/)).toBeTruthy();
  });

  it('shows the same hour to a reader in another zone', () => {
    const { getByText } = render(MidtermRow, {
      midterm: { ...base, start_time: '2026-10-02T09:00:00+09:00' },
    });
    expect(getByText(/Thu Oct 1, 7:00 PM/)).toBeTruthy();
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

/**
 * A midterm is a line in a printed listing, as docs/design/07-components.md
 * describes the exam row: the course code as the headline, the time as a
 * number, the status as a highlighted word. There is no table, no card and no
 * filled pill.
 */
describe('MidtermRow, as an exam row', () => {
  it('sets the entry as an exam row', () => {
    const { container } = render(MidtermRow, { midterm: base });
    expect(container.querySelector('.exam')).toBeTruthy();
    expect(container.querySelector('tr')).toBeNull();
  });

  it('heads the row with the course code and the course under it', () => {
    const { container } = render(MidtermRow, { midterm: base });
    const code = container.querySelector('.exam .code');
    expect(code.textContent).toContain('ECE 210');
    expect(code.textContent).toContain('Analog Signal Processing');
  });

  it('says the status as a highlighted word rather than as a filled pill', () => {
    const { container } = render(MidtermRow, { midterm: { ...base, status: 'Confirmed' } });
    const status = container.querySelector('.exam .hl');
    expect(status.textContent).toBe('Confirmed');
    expect(status.className).not.toMatch(/rounded|bg-/);
  });

  it('draws the tick as a pad inside a target big enough to hit', () => {
    const { container } = render(MidtermRow, { props: { midterm: base, canDelete: true } });
    const tick = container.querySelector('.tick');
    expect(tick.querySelector('.pad')).toBeTruthy();
    expect(tick.querySelector('input[type="checkbox"][data-midterm-tick]')).toBeTruthy();
  });

  it('reports the entry when its tick is ticked', async () => {
    const chosen = vi.fn();
    const { container } = render(MidtermRow, {
      props: { midterm: base, canDelete: true },
      events: { choose: chosen },
    });
    await fireEvent.click(container.querySelector('input[data-midterm-tick]'));
    expect(chosen.mock.calls[0][0].detail).toEqual({ midterm_id: 1, chosen: true });
  });
});
