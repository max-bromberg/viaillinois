import { monitorEventLoopDelay } from 'node:perf_hooks';
import { waitingCount } from '../db/pool.js';
import { createOverloadState } from '../lib/overloadState.js';
import { sendBusy, busyHtml } from '../lib/busyResponse.js';

/**
 * Refuse the cheapest traffic first, rather than being killed by the kernel.
 *
 * The alternative, which is what VIA did before this, is that everything is
 * accepted, callers queue for a database connection, memory climbs, and the
 * kernel picks a victim. On a host shared with other applications the victim
 * is not necessarily VIA. Choosing what to lose is the whole point.
 */

/** Which tier a request belongs to. Lower is refused sooner. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function tierOf(req) {
  const signedIn = Boolean(req.user);
  const reading = READ_METHODS.has(req.method);
  if (!signedIn && reading) return 1;
  if (!signedIn) return 2;
  if (reading) return 3;
  return 4;
}

/** The cutover script gates the deploy on this, so it is never refused. */
function isExempt(req) {
  return req.path === '/health';
}

function wantsHtml(req) {
  const accept = req.headers?.accept || '';
  return accept.includes('text/html');
}

/**
 * @param {{ state: { level: () => number }, retryAfterSeconds: number,
 *           onDenied: (denial: object) => void }} options
 * @returns {import('express').RequestHandler}
 */
export function createLoadShed({ state, retryAfterSeconds, onDenied }) {
  return function loadShed(req, res, next) {
    if (isExempt(req)) return next();

    const level = state.level();
    if (level === 0 || tierOf(req) > level) return next();

    onDenied({
      reason: 'overloaded',
      route: req.route?.path || req.path,
      authenticated: Boolean(req.user),
      client: req.clientIp,
    });

    if (wantsHtml(req)) {
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(503).type('html').send(busyHtml());
    }
    return sendBusy(res, retryAfterSeconds);
  };
}

/**
 * The production wiring: a real event loop histogram, the real in flight
 * count, and the real database queue gauge.
 *
 * The histogram is reset roughly once a second, so the percentile describes
 * recent history rather than the whole life of the process, which would take
 * hours to forget a bad minute.
 */
export function createProductionLoadShed({ onDenied }) {
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  let inFlight = 0;

  const state = createOverloadState({
    thresholds: {
      lagMs:     parseInt(process.env.SHED_LAG_MS || '200', 10),
      inFlight:  parseInt(process.env.SHED_MAX_INFLIGHT || '200', 10),
      dbWaiters: parseInt(process.env.SHED_MAX_DB_WAITERS || '20', 10),
    },
    recoveryRatio: parseFloat(process.env.SHED_RECOVERY_RATIO || '0.6'),
    readSignals: () => ({
      lagMs: histogram.percentile(90) / 1e6,
      inFlight,
      dbWaiters: waitingCount(),
    }),
  });

  const shed = createLoadShed({
    state,
    retryAfterSeconds: parseInt(process.env.SHED_RETRY_AFTER_SECONDS || '30', 10),
    onDenied,
  });

  const reset = setInterval(() => histogram.reset(), 1000);
  reset.unref?.();

  return function productionLoadShed(req, res, next) {
    inFlight += 1;
    // Both finish and close can fire for one response, so the release is
    // guarded. Without the guard the gauge drifts negative and the shedding
    // signal quietly stops working.
    let released = false;
    const release = () => { if (!released) { released = true; inFlight -= 1; } };
    res.on('finish', release);
    res.on('close', release);
    shed(req, res, next);
  };
}
