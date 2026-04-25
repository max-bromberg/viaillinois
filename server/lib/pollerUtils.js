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
    return {
      rowsProcessed: stats.upserted ?? 0,
      rowsSkipped: stats.skipped ?? 0,
      errorCount: 0,
      metadata: null,
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
