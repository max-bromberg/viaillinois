import { describe, it, expect, vi } from 'vitest';
import { campusTimeJson } from '../../middleware/campusTime.js';

/**
 * Every time this API publishes is a campus wall clock reading, because that is
 * how it is stored and how the organizer typed it. Sent as it stands, a browser
 * reads it in whatever zone the reader happens to be in, and a reader outside
 * Illinois is shown the wrong hour. Sent with the campus offset attached, the
 * value names one instant and every reader resolves it to the same one.
 */

/** Run the middleware and return what the wrapped res.json handed onward. */
function serialize(payload) {
  let captured;
  const res = { json: value => { captured = value; return res; } };
  campusTimeJson({}, res, () => {});
  res.json(payload);
  return captured;
}

describe('campusTimeJson', () => {
  it('stamps the campus offset onto a stored wall clock time', () => {
    expect(serialize({ start_time: '2026-07-15 18:00:00' }))
      .toEqual({ start_time: '2026-07-15T18:00:00-05:00' });
  });

  it('uses standard time for a winter date and daylight time for a summer one', () => {
    expect(serialize({ winter: '2026-01-15 18:00:00', summer: '2026-07-15 18:00:00' }))
      .toEqual({ winter: '2026-01-15T18:00:00-06:00', summer: '2026-07-15T18:00:00-05:00' });
  });

  it('reaches times nested in arrays of records, which is what the listings are', () => {
    const payload = { events: [{ event_id: 1, start_time: '2026-07-15 18:00:00', end_time: '2026-07-15 20:00:00' }] };
    expect(serialize(payload)).toEqual({
      events: [{ event_id: 1, start_time: '2026-07-15T18:00:00-05:00', end_time: '2026-07-15T20:00:00-05:00' }],
    });
  });

  it('converts a Date, which is what a value written in this process still is', () => {
    expect(serialize({ finished_at: new Date(Date.UTC(2026, 6, 15, 23, 0, 0)) }))
      .toEqual({ finished_at: '2026-07-15T18:00:00-05:00' });
  });

  it('leaves a date with no time alone, because a date names a day and not an instant', () => {
    expect(serialize({ date: '2026-07-15' })).toEqual({ date: '2026-07-15' });
  });

  it('leaves everything that is not a time alone', () => {
    const payload = { title: 'ECE 110 Midterm 1', score: 5, ok: true, room: null, tags: ['a', 'b'] };
    expect(serialize(payload)).toEqual(payload);
  });

  it('does not move a time that already carries an offset', () => {
    expect(serialize({ start_time: '2026-07-15T18:00:00-05:00' }))
      .toEqual({ start_time: '2026-07-15T18:00:00-05:00' });
  });

  it('holds the shape of the payload, so a record stays a record', () => {
    expect(Array.isArray(serialize({ list: [1, 2] }).list)).toBe(true);
  });

  it('calls next so the request carries on', () => {
    const next = vi.fn();
    campusTimeJson({}, { json: () => {} }, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
