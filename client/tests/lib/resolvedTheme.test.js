import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

/**
 * Which theme the page is actually in.
 *
 * The theme control offers three answers and only two of them name a theme. The
 * design system needs the third one resolved, because an organization's colour
 * is adapted differently for a light page and a dark one and that adaptation
 * happens in the client rather than in the stylesheet. Left to each component to
 * work out, "auto" would be read one way in the filter rail and another in the
 * agenda, and one organization would be two colours on one screen.
 */
describe('the resolved theme', () => {
  let listeners;

  beforeEach(async () => {
    vi.resetModules();
    listeners = [];
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    window.matchMedia = vi.fn(query => ({
      matches: query.includes('dark') && window.__prefersDark === true,
      media: query,
      addEventListener: (_, handler) => listeners.push(handler),
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
  });

  it('is the theme somebody chose, when they chose one', async () => {
    window.__prefersDark = true;
    const { themeMode, resolvedTheme } = await import('../../src/stores/theme.js');
    themeMode.set('light');
    expect(get(resolvedTheme)).toBe('light');
    themeMode.set('dark');
    expect(get(resolvedTheme)).toBe('dark');
  });

  it('follows the system when the choice is auto', async () => {
    window.__prefersDark = true;
    const { themeMode, resolvedTheme } = await import('../../src/stores/theme.js');
    themeMode.set('auto');
    expect(get(resolvedTheme)).toBe('dark');
  });

  it('is light when the choice is auto and the system asks for light', async () => {
    window.__prefersDark = false;
    const { themeMode, resolvedTheme } = await import('../../src/stores/theme.js');
    themeMode.set('auto');
    expect(get(resolvedTheme)).toBe('light');
  });

  it('follows the system preference as it changes, while the choice is auto', async () => {
    window.__prefersDark = false;
    const { themeMode, resolvedTheme } = await import('../../src/stores/theme.js');
    themeMode.set('auto');
    const seen = [];
    const stop = resolvedTheme.subscribe(theme => seen.push(theme));
    window.__prefersDark = true;
    listeners.forEach(handler => handler({ matches: true }));
    expect(get(resolvedTheme)).toBe('dark');
    expect(seen).toContain('dark');
    stop();
  });

  it('holds still on a chosen theme while the system preference changes', async () => {
    window.__prefersDark = false;
    const { themeMode, resolvedTheme } = await import('../../src/stores/theme.js');
    themeMode.set('light');
    const stop = resolvedTheme.subscribe(() => {});
    window.__prefersDark = true;
    listeners.forEach(handler => handler({ matches: true }));
    expect(get(resolvedTheme)).toBe('light');
    stop();
  });

  it('settles on light where the browser cannot say what the system prefers', async () => {
    window.matchMedia = undefined;
    const { themeMode, resolvedTheme } = await import('../../src/stores/theme.js');
    themeMode.set('auto');
    expect(get(resolvedTheme)).toBe('light');
  });
});
