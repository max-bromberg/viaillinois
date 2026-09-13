import { campusStartOfDay } from './campusTime.js';

/**
 * A page of events, grouped by the day each one falls on.
 *
 * docs/design/08-surfaces.md: pagination continues to serve eighteen events a
 * page, the day grouping is applied within a page, and a day may continue across
 * a page boundary, in which case its name repeats. Grouping the whole result set
 * instead would have the feed ask for every event in the term before it could
 * draw eighteen of them, which is the request the pagination exists to avoid.
 *
 * @param {Array<{ start_time: string }>|null|undefined} events one page, in order
 * @returns {Array<{ day: string, events: Array }>}
 */
export function groupByDay(events) {
  const groups = [];
  for (const event of events ?? []) {
    const day = campusStartOfDay(event.start_time);
    // An event the client cannot read a time from has no place on an agenda,
    // and a group of its own would be a day with no name.
    if (day === '') continue;
    const open = groups.at(-1);
    if (open && open.day === day) open.events.push(event);
    else groups.push({ day, events: [event] });
  }
  return groups;
}
