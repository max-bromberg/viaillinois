import { pruneOutbox } from '../db/queries/outbox.ts';

/**
 * Forgetting what the Discord bot has had time to read.
 *
 * The outbox is a log of every change the bot has to hear about, and a log
 * nobody prunes is a table that only grows. Thirty days is the window the
 * bot's own reconciliation is built around: a reader further behind than that
 * rebuilds its picture from the reading endpoints rather than from the log, so
 * nothing removed here is anything a reader could still have used.
 *
 * A prune that fails is reported and left for the next one. The entries are
 * old, so there is nothing urgent about removing them, and a database that
 * cannot take the delete should not be asked again at once.
 */

/** How many days of entries are kept when nothing says otherwise. */
export const RETENTION_DAYS = 30;

/** How often the prune runs when nothing says otherwise, which is hourly. */
export const PRUNE_INTERVAL_MS = 3_600_000;

let timer = null;

/** Remove the entries that are past the retention window. */
export async function pruneOldEntries() {
  const days = parseInt(process.env.OUTBOX_RETENTION_DAYS || String(RETENTION_DAYS), 10);
  try {
    await pruneOutbox(Number.isInteger(days) && days > 0 ? days : RETENTION_DAYS);
  } catch (err) {
    console.error('outbox prune failed, leaving the entries for the next one:', err.message);
  }
}

/** Begin pruning on an interval. Called once, from index.js. */
export function startOutboxPruner({ intervalMs } = {}) {
  const period = intervalMs
    || parseInt(process.env.OUTBOX_PRUNE_INTERVAL_MS || String(PRUNE_INTERVAL_MS), 10);
  timer = setInterval(() => { pruneOldEntries(); }, period);
  timer.unref?.();
  return timer;
}

/** Stop pruning. Called from the shutdown path. */
export async function stopOutboxPruner() {
  if (timer) clearInterval(timer);
  timer = null;
}
