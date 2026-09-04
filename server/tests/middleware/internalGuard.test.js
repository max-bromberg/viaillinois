import { describe, it, expect, vi } from 'vitest';
import { createInternalGuard } from '../../middleware/internalGuard.js';

function fakeResponse() {
  const recorded = { status: null, body: null };
  return {
    recorded,
    status(c) { recorded.status = c; return this; },
    json(b) { recorded.body = b; return this; },
  };
}

const TOKEN = 'a'.repeat(64);

const guardWith = (overrides = {}) => createInternalGuard({ token: TOKEN, onDenied: vi.fn(), ...overrides });

const req = (overrides = {}) => ({
  path: '/links/123', baseUrl: '/internal/v1', headers: {}, clientIp: '172.18.0.4', ...overrides,
});

/**
 * The internal service API is reachable by exactly one caller, the bot, on the
 * private network. Everything else is refused, and the refusal says as little
 * as possible: no hint that the path exists, no hint of what the token looks
 * like, and a count in the denial log so a probe shows up on the admin page.
 */
describe('createInternalGuard', () => {
  it('passes a request carrying the service token', () => {
    const next = vi.fn();
    guardWith()(req({ headers: { authorization: `Bearer ${TOKEN}` } }), fakeResponse(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('refuses a request with no token', () => {
    const res = fakeResponse();
    const next = vi.fn();
    guardWith()(req(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.recorded.status).toBe(401);
    expect(res.recorded.body).toEqual({ error: expect.any(String), code: 'unauthorized' });
  });

  it('refuses a wrong token, and one that is merely a prefix of the right one', () => {
    for (const bad of ['b'.repeat(64), TOKEN.slice(0, 63), TOKEN + 'a', '']) {
      const res = fakeResponse();
      guardWith()(req({ headers: { authorization: `Bearer ${bad}` } }), res, vi.fn());
      expect(res.recorded.status).toBe(401);
    }
  });

  it('refuses a token sent in any scheme but Bearer', () => {
    const res = fakeResponse();
    guardWith()(req({ headers: { authorization: `Basic ${TOKEN}` } }), res, vi.fn());
    expect(res.recorded.status).toBe(401);
  });

  it('answers 404 to a request that came through the reverse proxy, even with the right token', () => {
    // The bot reaches the origin directly on the container network. Anything
    // that arrived through the proxy came from the internet, and a proxy that
    // forwards this path is a misconfiguration that has to fail closed.
    for (const headers of [
      { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '203.0.113.7' },
      { authorization: `Bearer ${TOKEN}`, 'cf-connecting-ip': '203.0.113.7' },
    ]) {
      const res = fakeResponse();
      const next = vi.fn();
      guardWith()(req({ headers }), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.recorded.status).toBe(404);
      expect(res.recorded.body.code).toBe('not_found');
    }
  });

  it('does not exist at all when no token is configured', () => {
    // A deployment without the bot has no internal API, so there is nothing to
    // authenticate against and nothing to reveal.
    const res = fakeResponse();
    guardWith({ token: '' })(req({ headers: { authorization: 'Bearer ' } }), res, vi.fn());
    expect(res.recorded.status).toBe(404);
  });

  it('counts every refusal under its own reason, with the full path', () => {
    const onDenied = vi.fn();
    guardWith({ onDenied })(req(), fakeResponse(), vi.fn());
    expect(onDenied).toHaveBeenCalledWith({
      reason: 'internal_unauthorized', route: '/internal/v1/links/123',
      authenticated: false, client: '172.18.0.4',
    });
  });

  it('does not count a request it passed', () => {
    const onDenied = vi.fn();
    guardWith({ onDenied })(req({ headers: { authorization: `Bearer ${TOKEN}` } }), fakeResponse(), vi.fn());
    expect(onDenied).not.toHaveBeenCalled();
  });
});
