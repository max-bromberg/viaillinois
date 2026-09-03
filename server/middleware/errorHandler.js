import { sendBusy } from '../lib/busyResponse.js';

/**
 * Global Express error handler.
 * Catches errors passed via next(err) from any route.
 *
 * A 500 does not publish the underlying message in production. The messages
 * that reach here uninvited come from the database driver, and they name the
 * host, the account and driver internals. A status a route set on purpose is a
 * message a route wrote on purpose, so those are passed through unchanged.
 */

/** mysql2 raises one of these when the bounded connection queue is full. */
const QUEUE_FULL = new Set(['ER_CON_COUNT_ERROR', 'PROTOCOL_ENQUEUE_HANDSHAKE_TWICE']);
const POOL_RETRY_AFTER_SECONDS = parseInt(process.env.SHED_RETRY_AFTER_SECONDS || '30', 10);

export function errorHandler(err, req, res, _next) {
  // A full queue is the bounded pool working as designed, not a fault, so it
  // gets the same honest answer that shedding gives.
  if (QUEUE_FULL.has(err.code) || /queue limit/i.test(err.message || '')) {
    return sendBusy(res, POOL_RETRY_AFTER_SECONDS);
  }

  const status = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const message = status >= 500 && isProduction
    ? 'Internal server error'
    : (err.message || 'Internal server error');

  if (status >= 500) console.error('unhandled error:', err.message);

  const body = { error: message };
  if (!isProduction) body.stack = err.stack;
  res.status(status).json(body);
}
