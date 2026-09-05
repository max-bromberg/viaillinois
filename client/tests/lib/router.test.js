import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { navigate, currentPath, routeParams, matchRoute } from '../../src/lib/router.js';

beforeEach(() => {
  navigate('/');
});

describe('navigate()', () => {
  it('updates currentPath store to the given path', () => {
    navigate('/dashboard');
    expect(get(currentPath)).toBe('/dashboard');
  });

  it('updates window.location.pathname', () => {
    navigate('/midterms');
    expect(window.location.pathname).toBe('/midterms');
  });

  it('handles navigate back to root', () => {
    navigate('/');
    expect(get(currentPath)).toBe('/');
  });
});

describe('popstate listener', () => {
  it('updates currentPath when popstate fires', () => {
    window.history.pushState({}, '', '/popped');
    window.dispatchEvent(new PopStateEvent('popstate', {}));
    expect(get(currentPath)).toBe('/popped');
  });
});

describe('matchRoute()', () => {
  it('matches /events/:id and returns name and params', () => {
    expect(matchRoute('/events/42')).toEqual({ name: 'event-detail', params: { id: '42' } });
  });

  it('returns null for non-dynamic paths', () => {
    expect(matchRoute('/about')).toBeNull();
    expect(matchRoute('/events')).toBeNull();
    expect(matchRoute('/')).toBeNull();
  });

  it('does not match non-numeric event ids', () => {
    expect(matchRoute('/events/abc')).toBeNull();
  });

  it('matches the Discord link page and carries the session', () => {
    expect(matchRoute('/link/discord/hLbQ2mXk9wR4tYu7iOp1aSdFgHjKlZxCvBnM3qWe5rT')).toEqual({
      name: 'link-discord',
      params: { session: 'hLbQ2mXk9wR4tYu7iOp1aSdFgHjKlZxCvBnM3qWe5rT' },
    });
  });

  it('matches the page shown once the link is made', () => {
    expect(matchRoute('/link/discord/hLbQ2mXk9wR4tYu7iOp1aSdFgHjKlZxCvBnM3qWe5rT/done')).toEqual({
      name: 'link-discord-done',
      params: { session: 'hLbQ2mXk9wR4tYu7iOp1aSdFgHjKlZxCvBnM3qWe5rT' },
    });
  });

  it('does not match a session identifier of the wrong shape', () => {
    expect(matchRoute('/link/discord/not-a-session')).toBeNull();
  });
});

describe('navigate() routeParams updates', () => {
  it('sets routeParams when navigating to event detail', () => {
    navigate('/events/7');
    expect(get(routeParams)).toEqual({ id: '7' });
  });

  it('clears routeParams when navigating to a static route', () => {
    navigate('/events/7');
    navigate('/about');
    expect(get(routeParams)).toEqual({});
  });
});
