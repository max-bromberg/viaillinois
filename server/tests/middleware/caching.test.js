import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import { privateByDefault, publicFor, cacheControlForStaticFile } from '../../middleware/caching.js';

/** A stand in for a response, recording what was set on it. */
function fakeResponse() {
  const headers = {};
  return { set: (name, value) => { headers[name] = value; }, headers };
}

/**
 * VIA sits behind a CDN, so these headers decide how much of the site the edge
 * can answer on its own and, more importantly, what it must never keep.
 */
describe('privateByDefault', () => {
  it('keeps a response out of every shared cache', () => {
    const res = fakeResponse();
    const next = vi.fn();
    privateByDefault({}, res, next);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(next).toHaveBeenCalled();
  });
});

describe('publicFor', () => {
  it('lets the edge answer for a while, and the browser revalidate', () => {
    const res = fakeResponse();
    publicFor({ edgeSeconds: 30 })({}, res, vi.fn());
    expect(res.headers['Cache-Control']).toBe('public, max-age=0, s-maxage=30, stale-while-revalidate=300');
  });

  it('lets the browser keep it too, when that is asked for', () => {
    const res = fakeResponse();
    publicFor({ browserSeconds: 60, edgeSeconds: 3600, staleSeconds: 86400 })({}, res, vi.fn());
    expect(res.headers['Cache-Control'])
      .toBe('public, max-age=60, s-maxage=3600, stale-while-revalidate=86400');
  });

  it('replaces the private default, so the order it is mounted in is what decides', () => {
    const res = fakeResponse();
    privateByDefault({}, res, vi.fn());
    publicFor({ edgeSeconds: 30 })({}, res, vi.fn());
    expect(res.headers['Cache-Control']).toMatch(/^public/);
  });
});

/**
 * Built assets carry a content hash in their names, so a name never means two
 * different files and a browser never has to ask about one twice. Everything
 * else is served under a stable name and has to be checked for now and then.
 */
describe('cacheControlForStaticFile', () => {
  it('keeps a hashed asset forever', () => {
    expect(cacheControlForStaticFile(join('dist', 'assets', 'index-BE9Os6py.js')))
      .toBe('public, max-age=31536000, immutable');
  });

  it('lets a file served under a stable name go stale while it is checked', () => {
    const value = cacheControlForStaticFile(join('dist', 'via_logo_black.svg'));
    expect(value).toBe('public, max-age=3600, stale-while-revalidate=86400');
  });

  it('does not mistake a path that merely mentions assets for the assets directory', () => {
    expect(cacheControlForStaticFile(join('dist', 'assets-guide.png')))
      .toMatch(/max-age=3600/);
  });
});
