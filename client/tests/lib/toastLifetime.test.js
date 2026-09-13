import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { toast, showToast } from '../../src/stores/ui.js';

/**
 * How long a toast stays.
 *
 * docs/design/07-components.md: a toast goes after six seconds or when it is
 * dismissed, and an error is given no duration, because a sentence saying the
 * feed did not load should still be there when the reader looks up. The Toast
 * component was built to that, and the chrome asks it for no duration on an
 * error, but showToast kept a three second timer of its own that emptied the
 * store underneath it. The component's setting never reached a screen: every
 * toast went after three seconds, an error included, and the Account page's
 * answer about the Discord link came and went before somebody coming back from
 * Discord could read it.
 *
 * The lifetime belongs to the toast, so it travels with it.
 */
beforeEach(() => { vi.useFakeTimers(); toast.set(null); });
afterEach(() => { vi.useRealTimers(); });

describe('how long a toast stays', () => {
  it('gives an ordinary toast the six seconds the component document names', () => {
    showToast('Event created');
    expect(get(toast)).toMatchObject({ message: 'Event created', type: 'success', duration: 6000 });
  });

  it('gives an error no duration, so it stays until it is dismissed', () => {
    showToast('That file was not a calendar.', 'error');
    expect(get(toast).duration).toBe(0);
  });

  it('does not empty the store from under the toast', () => {
    showToast('Link copied.');
    vi.advanceTimersByTime(60000);
    expect(get(toast)).not.toBe(null);
  });

  it('still takes a duration from a caller that wants a different one', () => {
    showToast('Saved.', 'success', 2000);
    expect(get(toast).duration).toBe(2000);
  });
});
