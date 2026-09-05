import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rememberAfterSignIn, takeAfterSignIn, AFTER_SIGN_IN_MINUTES } from '../../src/lib/afterSignIn.js';

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); });

/**
 * Where somebody goes once they have signed in. It is stored in the browser,
 * where it survives the tab being closed, so it has to stop being used at some
 * point: a path remembered weeks ago and never taken would otherwise send
 * somebody to a link page they have long forgotten the moment they next sign in.
 */
describe('the path to return to after signing in', () => {
  it('hands back the path it was given', () => {
    rememberAfterSignIn('/link/discord/abc');
    expect(takeAfterSignIn()).toBe('/link/discord/abc');
  });

  it('forgets the path as it hands it over', () => {
    rememberAfterSignIn('/link/discord/abc');
    takeAfterSignIn();
    expect(takeAfterSignIn()).toBeNull();
  });

  it('keeps a path remembered a few minutes ago', () => {
    rememberAfterSignIn('/link/discord/abc');
    vi.advanceTimersByTime((AFTER_SIGN_IN_MINUTES - 1) * 60_000);
    expect(takeAfterSignIn()).toBe('/link/discord/abc');
  });

  it('ignores a path remembered longer ago than the window', () => {
    rememberAfterSignIn('/link/discord/abc');
    vi.advanceTimersByTime((AFTER_SIGN_IN_MINUTES + 1) * 60_000);
    expect(takeAfterSignIn()).toBeNull();
  });

  it('forgets a path it ignored, so it is not weighed again', () => {
    rememberAfterSignIn('/link/discord/abc');
    vi.advanceTimersByTime((AFTER_SIGN_IN_MINUTES + 1) * 60_000);
    takeAfterSignIn();
    expect(window.localStorage.getItem('via_after_sign_in')).toBeNull();
  });

  it('keeps only paths on this site', () => {
    for (const path of ['https://elsewhere.example/x', '//elsewhere.example/x', 'x', 7, null]) {
      rememberAfterSignIn(path);
      expect(takeAfterSignIn()).toBeNull();
    }
  });

  it('ignores anything else that is already under the key', () => {
    window.localStorage.setItem('via_after_sign_in', 'not-json');
    expect(takeAfterSignIn()).toBeNull();
  });

  it('ignores a stored entry whose path is not one on this site', () => {
    window.localStorage.setItem(
      'via_after_sign_in',
      JSON.stringify({ path: 'https://elsewhere.example/x', at: Date.now() }),
    );
    expect(takeAfterSignIn()).toBeNull();
  });
});
