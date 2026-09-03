import { describe, it, expect, vi } from 'vitest';
import { createLoadShed } from '../../middleware/loadShed.js';
import { BUSY_MESSAGE } from '../../lib/busyResponse.js';

function fakeResponse() {
  const recorded = { headers: {}, status: null, body: null, type: null };
  return {
    recorded,
    set(n, v) { recorded.headers[n] = v; return this; },
    status(c) { recorded.status = c; return this; },
    json(b) { recorded.body = b; return this; },
    type(v) { recorded.type = v; return this; },
    send(b) { recorded.body = b; return this; },
  };
}

const shedAt = level => createLoadShed({
  state: { level: () => level },
  retryAfterSeconds: 30,
  onDenied: vi.fn(),
});

const req = (overrides = {}) => ({
  path: '/api/v1/events', method: 'GET', headers: { accept: 'application/json' }, ...overrides,
});

/**
 * Traffic is refused in order of increasing value. An anonymous read of the
 * public feed is the cheapest thing to lose and most of the volume. A board
 * member's half written event is the most expensive, so it is refused last, and
 * the health endpoint is never refused at all, because the cutover script gates
 * the deploy on it and shedding it would turn a busy minute into a rollback.
 */
describe('createLoadShed', () => {
  it('serves everything while nothing is wrong', () => {
    const next = vi.fn();
    shedAt(0)(req(), fakeResponse(), next);
    expect(next).toHaveBeenCalled();
  });

  it('refuses an anonymous read at the first level', () => {
    const res = fakeResponse();
    const next = vi.fn();
    shedAt(1)(req(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.recorded.status).toBe(503);
    expect(res.recorded.body.error).toBe(BUSY_MESSAGE);
    expect(res.recorded.headers['Retry-After']).toBe('30');
  });

  it('still serves a signed in reader at the first level', () => {
    const next = vi.fn();
    shedAt(1)(req({ user: { net_id: 'mbrom' } }), fakeResponse(), next);
    expect(next).toHaveBeenCalled();
  });

  it('refuses a signed in reader once things are twice as bad', () => {
    const next = vi.fn();
    shedAt(3)(req({ user: { net_id: 'mbrom' } }), fakeResponse(), next);
    expect(next).not.toHaveBeenCalled();
  });

  it('still accepts a board member writing an event at that point', () => {
    const next = vi.fn();
    shedAt(3)(req({ user: { net_id: 'mbrom' }, method: 'POST' }), fakeResponse(), next);
    expect(next).toHaveBeenCalled();
  });

  it('refuses even that at the worst level', () => {
    const next = vi.fn();
    shedAt(4)(req({ user: { net_id: 'mbrom' }, method: 'POST' }), fakeResponse(), next);
    expect(next).not.toHaveBeenCalled();
  });

  it('never refuses the health endpoint, at any level', () => {
    const next = vi.fn();
    shedAt(4)(req({ path: '/health' }), fakeResponse(), next);
    expect(next).toHaveBeenCalled();
  });

  it('answers a browser with a page rather than with JSON', () => {
    const res = fakeResponse();
    shedAt(1)(req({ headers: { accept: 'text/html' } }), res, vi.fn());
    expect(res.recorded.type).toBe('html');
    expect(res.recorded.body).toContain(BUSY_MESSAGE);
  });

  it('reports every refusal, so the denial log can count it', () => {
    const onDenied = vi.fn();
    createLoadShed({ state: { level: () => 1 }, retryAfterSeconds: 30, onDenied })(
      req(), fakeResponse(), vi.fn()
    );
    expect(onDenied).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'overloaded', authenticated: false })
    );
  });
});
