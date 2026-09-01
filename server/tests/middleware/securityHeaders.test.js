import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { securityHeaders } from '../../middleware/securityHeaders.js';

// The middleware reads the environment per request, not once at startup, so
// the variable has to be set around the request rather than around the build.
function appWith(env) {
  const app = express();
  app.use((_req, _res, next) => { process.env.NODE_ENV = env; next(); });
  app.use(securityHeaders);
  app.get('/', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('securityHeaders', () => {
  afterEach(() => { process.env.NODE_ENV = 'test'; });

  it('stops browsers guessing a response type, which is how a text file becomes a script', async () => {
    const res = await request(appWith('production')).get('/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  /**
   * SAMEORIGIN rather than DENY: the kiosk is meant to be shown on a screen in
   * a building lobby and may be embedded by another page of our own.
   */
  it('refuses framing by other sites', async () => {
    const res = await request(appWith('production')).get('/');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('does not leak the full URL to sites people click through to', async () => {
    const res = await request(appWith('production')).get('/');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('asks browsers to stay on https in production', async () => {
    const res = await request(appWith('production')).get('/');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
  });

  /**
   * Sent only in production. On a local instance there is no https, and a
   * browser that has been told to force it will refuse to load the dev server
   * afterwards, which is a confusing thing to inflict on someone.
   */
  it('does not force https anywhere else', async () => {
    const res = await request(appWith('development')).get('/');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('does not announce the server technology', async () => {
    const res = await request(appWith('production')).get('/');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
