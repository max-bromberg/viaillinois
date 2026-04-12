import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { navigate, currentPath } from '../../src/lib/router.js';

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
