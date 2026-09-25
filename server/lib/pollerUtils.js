import {
  insertPollLog,
  finalizePollLog,
  insertUnknownBuildingCode,
} from '../db/queries/pollLog.js';
import { drainUnknownCodes } from './locationNormalizer.js';

function normalizeStats(service, stats) {
  if (service === 'courses') {
    return {
      rowsProcessed: (stats.totalCourses ?? 0) + (stats.totalSections ?? 0),
      rowsSkipped: 0,
      errorCount: stats.totalErrors ?? 0,
      metadata: {
        totalCourses: stats.totalCourses ?? 0,
        totalSections: stats.totalSections ?? 0,
      },
    };
  }
  if (service === 'facilities' || service === 'astra') {
    /*
     * The span of start times the poll wrote, and how many rows it failed to write.
     * Together they say which bookings a poll would have shown if they were still booked,
     * which is how a booking's last sighting is read later: a booking not seen since a
     * clean poll that covered its date was not in that poll.
     *
     * The failed rows sit beside the span rather than in the error count, because the
     * admin page reads the error count as the run having failed, and one bad row out of
     * six thousand is not a failed run.
     */
    return {
      rowsProcessed: stats.upserted ?? 0,
      rowsSkipped: stats.skipped ?? 0,
      errorCount: 0,
      metadata: stats.coverage ? { coverage: stats.coverage, failed: stats.failed ?? 0 } : null,
    };
  }
  console.warn(`[pollerUtils] unknown service: ${service}`);
  return { rowsProcessed: 0, rowsSkipped: 0, errorCount: 0, metadata: null };
}

function isNotImplemented(e) {
  return e?.message?.includes('Not implemented');
}

async function tryLog(fn) {
  try { return await fn(); }
  catch (e) { if (!isNotImplemented(e)) throw e; }
}

async function executeRun(service, logId, runOnceFn) {
  let stats;
  try {
    stats = await runOnceFn();
  } catch (err) {
    drainUnknownCodes(); // discard partial-run codes so they don't leak to next run
    if (logId != null) {
      await tryLog(() => finalizePollLog(logId, {
        finishedAt: new Date(),
        rowsProcessed: 0,
        rowsSkipped: 0,
        errorCount: 1,
        lastError: err.message,
        metadata: null,
      }));
    }
    throw err;
  }
  const unknownCodes = drainUnknownCodes();
  const normalized = normalizeStats(service, stats);
  if (logId != null) {
    await tryLog(() => finalizePollLog(logId, { finishedAt: new Date(), ...normalized }));
    for (const code of unknownCodes) {
      await tryLog(() => insertUnknownBuildingCode(logId, code));
    }
  }
  return stats;
}

export async function runWithLogging(service, runOnceFn) {
  let logId;
  try {
    logId = await insertPollLog(service, new Date());
  } catch (e) {
    if (!isNotImplemented(e)) throw e;
  }
  return executeRun(service, logId, runOnceFn);
}

export async function startPollerRun(service, runOnceFn) {
  let logId;
  try {
    logId = await insertPollLog(service, new Date());
  } catch (e) {
    if (!isNotImplemented(e)) throw e;
  }
  executeRun(service, logId, runOnceFn).catch(err => {
    console.error(`[pollerUtils] background run error (${service}): ${err.message}`);
  });
  return logId;
}

/**
 * The span of start times one facilities poll wrote.
 *
 * Kept in the database's own format, so that it compares directly against the start
 * times of the bookings it covers. Ad Astra sends an ISO datetime with a T in it and
 * Tableau's rows are already built without one.
 *
 * @returns {{ note: (startTime: string) => void, span: () => { first_start: string, last_start: string } | null }}
 */
export function coverageTracker() {
  let first = null;
  let last = null;
  return {
    note(startTime) {
      const value = String(startTime).replace('T', ' ').slice(0, 19);
      if (first === null || value < first) first = value;
      if (last === null || value > last) last = value;
    },
    span() {
      return first === null ? null : { first_start: first, last_start: last };
    },
  };
}
