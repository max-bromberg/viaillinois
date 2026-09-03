import { upsertDenialBuckets, pruneDenials } from '../db/queries/accessDenials.js';

/**
 * Counting what VIA refused, without making the refusal expensive.
 *
 * This is called on the hot path of every refused request, and the situation
 * in which it is called most is the situation in which the database is already
 * the thing under pressure. So a refusal costs a map lookup and some
 * arithmetic, and one write a minute carries the whole result.
 *
 * The buffer is bounded, because a flood of distinct routes would otherwise
 * make the telemetry the memory leak it exists to detect. A flush that fails
 * drops its buffer rather than retrying, on the same reasoning: a database
 * that cannot take the write should not be asked twice.
 */

const BUFFER_MAX_KEYS = parseInt(process.env.DENIAL_BUFFER_MAX_KEYS || '5000', 10);
const CLIENTS_PER_KEY_MAX = parseInt(process.env.DENIAL_CLIENTS_PER_KEY_MAX || '1000', 10);
const RETENTION_DAYS = parseInt(process.env.DENIAL_RETENTION_DAYS || '90', 10);

/** key -> { bucketStart, reason, route, authenticated, denialCount, clients:Set } */
let buffer = new Map();
let droppedKeys = 0;
let timer = null;

/** The start of the minute a moment falls in, as campus wall clock. */
function minuteBucket(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

/**
 * Count one refusal.
 * @param {{ reason: string, route: string, authenticated: boolean, client?: string }} denial
 */
export function recordDenial({ reason, route, authenticated, client }) {
  const bucketStart = minuteBucket();
  const key = `${bucketStart}|${reason}|${route}|${authenticated ? 1 : 0}`;
  let entry = buffer.get(key);
  if (!entry) {
    if (buffer.size >= BUFFER_MAX_KEYS) { droppedKeys += 1; return; }
    entry = {
      bucketStart, reason, route, authenticated: Boolean(authenticated),
      denialCount: 0, clients: new Set(),
    };
    buffer.set(key, entry);
  }
  entry.denialCount += 1;
  // The set exists only until the flush that reads its size, and its members
  // are never written anywhere.
  if (entry.clients.size < CLIENTS_PER_KEY_MAX) entry.clients.add(client || 'unknown');
}

/** Write the buffer and empty it. Exported so tests do not wait on a timer. */
export async function flushDenials() {
  if (buffer.size === 0) return;
  const rows = [...buffer.values()].map(entry => ({
    bucketStart: entry.bucketStart,
    reason: entry.reason,
    route: entry.route,
    authenticated: entry.authenticated,
    denialCount: entry.denialCount,
    clientCount: entry.clients.size,
  }));
  buffer = new Map();
  if (droppedKeys > 0) {
    console.warn(`denial recorder dropped ${droppedKeys} distinct keys past its bound`);
    droppedKeys = 0;
  }
  try {
    await upsertDenialBuckets(rows);
    await pruneDenials(RETENTION_DAYS);
  } catch (err) {
    console.error('denial flush failed, discarding the buffer:', err.message);
  }
}

/** How many distinct buckets are waiting to be written. */
export function bufferSize() {
  return buffer.size;
}

/** Drop everything held. For tests. */
export function resetRecorder() {
  buffer = new Map();
  droppedKeys = 0;
}

/** Begin flushing on an interval. Called once, from index.js. */
export function startDenialRecorder({ intervalMs } = {}) {
  const period = intervalMs || parseInt(process.env.DENIAL_FLUSH_INTERVAL_MS || '60000', 10);
  timer = setInterval(() => { flushDenials(); }, period);
  timer.unref?.();
  return timer;
}

/** Stop flushing, and write whatever is left. Called from the shutdown path. */
export async function stopDenialRecorder() {
  if (timer) clearInterval(timer);
  timer = null;
  await flushDenials();
}
