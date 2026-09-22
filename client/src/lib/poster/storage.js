/**
 * Where a poster design is kept between visits.
 *
 * A design is kept in the browser that made it, against the event it is a
 * poster for, so that a board member who reloads the page, or comes back to it
 * after a lecture, finds their work where they left it rather than starting
 * again. It is that browser and that person only. It does not follow them to
 * another machine, and a co-organizer opening the same event sees none of it,
 * which the designer says in as many words rather than leaving anybody to find
 * out by losing something.
 *
 * Every read and every write is guarded. Browser storage throws outright in a
 * private window, and it comes back empty wherever site data has been cleared,
 * and a designer that refused to open because it could not remember anything
 * would be worse than one that simply starts fresh.
 */

const KEY = 'via.poster';

const keyFor = eventId => `${KEY}.${eventId}`;

/** Whether what came back out of storage is a poster document and not something else. */
function isPoster(value) {
  return Boolean(value)
    && typeof value === 'object'
    && Array.isArray(value.layers)
    && typeof value.background === 'string'
    && Number.isFinite(value.width)
    && Number.isFinite(value.height);
}

/** The design saved for an event, or null where there is none to read. */
export function readDesign(eventId) {
  try {
    const stored = window.localStorage.getItem(keyFor(eventId));
    if (!stored) return null;
    const poster = JSON.parse(stored);
    return isPoster(poster) ? poster : null;
  } catch {
    return null;
  }
}

/** Save a design, answering whether the browser took it. */
export function writeDesign(eventId, poster) {
  try {
    window.localStorage.setItem(keyFor(eventId), JSON.stringify(poster));
    return true;
  } catch {
    return false;
  }
}

/** Forget the design saved for an event, which starting again from a template does. */
export function forgetDesign(eventId) {
  try {
    window.localStorage.removeItem(keyFor(eventId));
  } catch {
    // Nothing was stored, so there is nothing to forget.
  }
}
