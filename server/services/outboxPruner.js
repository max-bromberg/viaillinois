import { pruneOutbox } from '../db/queries/outbox.ts';
import { pruneLinkSessions } from '../db/queries/discordLinks.ts';

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

/**
 * Remove the link sessions that are done with.
 *
 * A link session lasts ten minutes and is finished after that, used or not,
 * but every row holds a Discord identifier and the time somebody asked to
 * link. Nothing else removes them, so the table would otherwise grow for ever
 * as a list of exactly that. This runs beside the outbox prune because it is
 * the same kind of work on the same schedule, and it is reported and left for
 * the next run in the same way when it fails.
 */
export async function pruneExpiredLinkSessions() {
  try {
    await pruneLinkSessions();
  } catch (err) {
    console.error('link session prune failed, leaving the rows for the next one:', err.message);
  }
}

/**
 * Everything this service prunes, once. Each part reports its own failure and
 * returns, so a database that refuses one delete does not stop the other.
 */
export async function pruneOnce() {
  await pruneOldEntries();
  await pruneExpiredLinkSessions();
}

/**
 * Begin pruning on an interval. Called once, from index.js.
 *
 * The first prune runs immediately rather than after a full interval. The
 * interval is an hour by default, and a process that is restarted more often
 * than that would otherwise never prune anything at all.
 */
export function startOutboxPruner({ intervalMs } = {}) {
  const period = intervalMs
    || parseInt(process.env.OUTBOX_PRUNE_INTERVAL_MS || String(PRUNE_INTERVAL_MS), 10);
  pruneOnce();
  timer = setInterval(() => { pruneOnce(); }, period);
  timer.unref?.();
  return timer;
}

/** Stop pruning. Called from the shutdown path. */
export async function stopOutboxPruner() {
  if (timer) clearInterval(timer);
  timer = null;
}
