import { toIsoWithOffset } from '../lib/timezone.js';

/**
 * Publish every time in this API as an instant on the campus clock.
 *
 * Times are stored as wall clock with no zone, because that is what the
 * organizer typed. A wall clock reading sent as it stands is not an instant:
 * the browser resolves it in whatever zone the reader is sitting in, so the
 * same event showed one hour in Champaign and another to a student reading it
 * over the winter break from somewhere else. It also made the answer depend on
 * the zone the server container happened to start in, which no reader can see.
 *
 * Attaching the campus offset settles both. The value names one instant, every
 * reader resolves it to the same one, and the client renders it back in campus
 * time, which for a site that serves one campus is the only reading anybody
 * wants.
 */

/** A stored wall clock reading, with or without the T that JSON tends to add. */
const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/;

/**
 * Walk a response body and stamp the campus offset onto every time in it.
 *
 * Dates with no time of day are left as they are: a date names a day rather
 * than an instant, and giving it an offset would turn it into midnight
 * somewhere and shift it a day for half the readers.
 */
export function withCampusOffset(value) {
  if (value instanceof Date) return toIsoWithOffset(value) ?? value;
  if (typeof value === 'string') {
    return WALL_CLOCK.test(value) ? toIsoWithOffset(value) ?? value : value;
  }
  if (Array.isArray(value)) return value.map(withCampusOffset);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, inner] of Object.entries(value)) out[key] = withCampusOffset(inner);
    return out;
  }
  return value;
}

/**
 * Express middleware wrapping res.json, so that no route has to remember.
 * A route that forgot was the whole of the original inconsistency.
 */
export function campusTimeJson(_req, res, next) {
  const original = res.json.bind(res);
  res.json = body => original(withCampusOffset(body));
  next();
}
