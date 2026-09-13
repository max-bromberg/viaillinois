import { describe, it, expect } from 'vitest';
import { groupByDay } from '../../src/lib/agenda.js';

/**
 * The agenda groups a page of events by day.
 *
 * docs/design/08-surfaces.md: pagination continues to serve eighteen events a
 * page, the day grouping is applied within a page, and a day may continue across
 * a page boundary, in which case its name repeats. That last clause is the whole
 * reason this is a function with a test rather than three lines in the feed:
 * grouping across the whole result set instead of within the page would have the
 * feed ask for every event in the term before it could draw eighteen of them.
 */
const at = (day, hour) => ({
  event_id: Number(`${day}${hour}`),
  start_time: `2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00-05:00`,
});

describe('grouping a page by day', () => {
  it('puts the events of one day together, in the order they arrived', () => {
    const groups = groupByDay([at(10, 18), at(10, 19), at(11, 17)]);
    expect(groups).toHaveLength(2);
    expect(groups[0].day).toBe('2026-09-10');
    expect(groups[0].events.map(event => event.event_id)).toEqual([1018, 1019]);
    expect(groups[1].day).toBe('2026-09-11');
  });

  it('groups by the campus day rather than by the reader own', () => {
    // Half past eleven at night on the tenth in Urbana is already the eleventh
    // in UTC, and the two events belong to the same evening.
    const groups = groupByDay([
      { event_id: 1, start_time: '2026-09-10T22:00:00-05:00' },
      { event_id: 2, start_time: '2026-09-10T23:30:00-05:00' },
    ]);
    expect(groups).toHaveLength(1);
  });

  it('opens a new group when a day comes back after another, which is a page boundary', () => {
    // A page can begin in the middle of a day. The feed draws the groups it is
    // given, so a day that comes back has its name repeated rather than its
    // events pulled backwards out of order.
    const groups = groupByDay([at(10, 18), at(11, 9), at(11, 18)]);
    expect(groups.map(group => group.day)).toEqual(['2026-09-10', '2026-09-11']);
  });

  it('leaves an event with no time it can read out of the agenda rather than in a group of its own', () => {
    const groups = groupByDay([at(10, 18), { event_id: 9, start_time: null }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].events).toHaveLength(1);
  });

  it('is empty for an empty page', () => {
    expect(groupByDay([])).toEqual([]);
    expect(groupByDay(null)).toEqual([]);
  });
});
