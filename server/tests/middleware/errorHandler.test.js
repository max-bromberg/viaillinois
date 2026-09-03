import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { errorHandler } from '../../middleware/errorHandler.js';
import { BUSY_MESSAGE } from '../../lib/busyResponse.js';

function makeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json   = (body)  => { res.body = body; return res; };
  return res;
}

describe('errorHandler', () => {
  it('returns 500 with error message', () => {
    const err = new Error('Something broke');
    const res = makeRes();
    errorHandler(err, {}, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Something broke');
  });

  it('uses err.status if set', () => {
    const err = Object.assign(new Error('Not found'), { status: 404 });
    const res = makeRes();
    errorHandler(err, {}, res, () => {});
    expect(res.statusCode).toBe(404);
  });

  it('hides stack in production', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('Internal');
    const res = makeRes();
    errorHandler(err, {}, res, () => {});
    expect(res.body.stack).toBeUndefined();
    process.env.NODE_ENV = 'test';
  });
});

/**
 * Two changes. A driver error message names the host, the account and driver
 * internals, and this handler was publishing it to whoever provoked it. And a
 * full connection queue is not really a server fault, it is the bounded queue
 * doing its job, so it gets the same honest answer as shedding does.
 */
describe('errorHandler in production', () => {
  const previous = process.env.NODE_ENV;
  beforeEach(() => { process.env.NODE_ENV = 'production'; });
  afterEach(() => { process.env.NODE_ENV = previous; });

  function fakeResponse() {
    const recorded = { headers: {}, status: null, body: null };
    return {
      recorded,
      set(n, v) { recorded.headers[n] = v; return this; },
      status(c) { recorded.status = c; return this; },
      json(b) { recorded.body = b; return this; },
    };
  }

  it('does not publish a driver message to the caller', () => {
    const res = fakeResponse();
    const err = new Error("Access denied for user 'via'@'172.18.0.4'");
    errorHandler(err, {}, res, () => {});
    expect(res.recorded.status).toBe(500);
    expect(res.recorded.body.error).toBe('Internal server error');
    expect(JSON.stringify(res.recorded.body)).not.toContain('172.18.0.4');
  });

  it('still passes through a message a route wrote on purpose', () => {
    const res = fakeResponse();
    const err = Object.assign(new Error('Event not found'), { status: 404 });
    errorHandler(err, {}, res, () => {});
    expect(res.recorded.status).toBe(404);
    expect(res.recorded.body.error).toBe('Event not found');
  });

  it('turns a full connection queue into the busy answer', () => {
    const res = fakeResponse();
    const err = Object.assign(new Error('Queue limit reached'), { code: 'ER_CON_COUNT_ERROR' });
    errorHandler(err, {}, res, () => {});
    expect(res.recorded.status).toBe(503);
    expect(res.recorded.body.error).toBe(BUSY_MESSAGE);
    expect(res.recorded.headers['Retry-After']).toBe('30');
  });
});
