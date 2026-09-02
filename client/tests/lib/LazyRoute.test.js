import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import LazyRoute from '../../src/lib/LazyRoute.svelte';
import Footer from '../../src/lib/Footer.svelte';

/**
 * Every page used to be in the first download, so a student opening the feed
 * paid for the logistics dashboard, the scheduler and the poster designer
 * before seeing an event. Pages are fetched when they are first opened instead.
 */
describe('LazyRoute', () => {
  it('renders the page once it has arrived', async () => {
    const { findByText } = render(LazyRoute, {
      load: () => import('../../src/lib/Footer.svelte'),
    });
    expect(await findByText(/VIA/)).toBeTruthy();
  });

  it('hands the page its props', async () => {
    // Nested, because testing library reads a bare props key as its own option.
    const { findByText } = render(LazyRoute, {
      props: { load: () => Promise.resolve({ default: Footer }), props: {} },
    });
    expect(await findByText(/VIA/)).toBeTruthy();
  });

  it('loads the page once, however often the surrounding page redraws', async () => {
    const load = vi.fn(() => Promise.resolve({ default: Footer }));
    const { component, rerender } = render(LazyRoute, { load });
    await rerender({ load, props: { unused: 1 } });
    expect(load).toHaveBeenCalledTimes(1);
  });

  /**
   * A deploy replaces the file names of every chunk, so a tab left open
   * overnight asks for a page that is no longer there. Saying so beats a blank
   * area of screen with an error in a console nobody has open.
   */
  it('says what to do when a page cannot be fetched', async () => {
    const { findByText } = render(LazyRoute, {
      load: () => Promise.reject(new Error('failed to fetch dynamically imported module')),
    });
    expect(await findByText(/could not be loaded/i)).toBeTruthy();
    expect(await findByText(/Reload/i)).toBeTruthy();
  });
});
