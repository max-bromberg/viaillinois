import { addViews } from '../db/queries/eventViews.ts';
import { campusStartOfToday } from '../lib/timezone.js';

/**
 * Counting how often an event page is read, without making the reading
 * expensive and without recording who did it.
 *
 * A board could already see who said they were interested and what people
 * thought afterwards, and both of those reach VIA through the Discord bot, so
 * a board whose members are not on Discord read a column of zeros and learned
 * nothing about whether anybody saw the event at all. This is the one signal
 * the platform can collect by itself.
 *
 * The arrangement is the one the refusal counts already use, for the same
 * reason: a reading costs a map lookup and some arithmetic, and one write a
 * minute carries the whole result. The page this counts is the one page every
 * anonymous reader on the site can open, so the moment it is read hardest is
 * the moment the database should be asked least.
 *
 * Nothing about the reader is held, at any point, in memory or on disk: not an
 * address, not a hash of one, not a session. That means the number counts
 * readings rather than readers, so one person refreshing five times is five.
 * That is the crude measure on purpose. The precise one is bought with a record
 * of who read what, and VIA does not keep one.
 */

/** How many distinct events may be held between writes. */
const BUFFER_MAX_KEYS = parseInt(process.env.VIEW_BUFFER_MAX_KEYS || '10000', 10);

/** key -> { eventId, day, viewCount } */
let buffer = new Map();
let droppedKeys = 0;
let timer = null;

/**
 * Count one reading of an event page.
 *
 * Anything that is not the identifier of an event is counted as nothing rather
 * than under a key of its own, because the identifier arrives from the address
 * bar and a bound on the buffer is no use if a caller chooses its keys.
 *
 * @param {number} eventId
 */
export function recordView(eventId) {
  const id = Number(eventId);
  if (!Number.isInteger(id) || id <= 0) return;

  // The column is a date, and campusStartOfToday answers with the whole
  // instant, so the day is the date part of it on the campus clock.
  const day = campusStartOfToday().slice(0, 10);
  const key = `${id}|${day}`;
  let entry = buffer.get(key);
  if (!entry) {
    if (buffer.size >= BUFFER_MAX_KEYS) { droppedKeys += 1; return; }
    entry = { eventId: id, day, viewCount: 0 };
    buffer.set(key, entry);
  }
  entry.viewCount += 1;
}

/** Write what is held and empty it. Exported so tests do not wait on a timer. */
export async function flushViews() {
  if (buffer.size === 0) return;
  const rows = [...buffer.values()];
  buffer = new Map();
  if (droppedKeys > 0) {
    console.warn(`view recorder dropped ${droppedKeys} distinct events past its bound`);
    droppedKeys = 0;
  }
  try {
    await addViews(rows);
  } catch (err) {
    // Dropped rather than retried. A database that cannot take this write
    // should not be asked twice for it, and of everything the platform is
    // doing at that moment, counting a reading is the least important.
    console.error('view flush failed, discarding the buffer:', err.message);
  }
}

/** How many distinct events are waiting to be written. */
export function bufferSize() {
  return buffer.size;
}

/** Drop everything held. For tests. */
export function resetViewRecorder() {
  buffer = new Map();
  droppedKeys = 0;
}

/** Begin writing on an interval. Called once, from index.js. */
export function startViewRecorder({ intervalMs } = {}) {
  const period = intervalMs || parseInt(process.env.VIEW_FLUSH_INTERVAL_MS || '60000', 10);
  timer = setInterval(() => { flushViews(); }, period);
  timer.unref?.();
  return timer;
}

/** Stop writing, and write whatever is left. Called from the shutdown path. */
export async function stopViewRecorder() {
  if (timer) clearInterval(timer);
  timer = null;
  await flushViews();
}
