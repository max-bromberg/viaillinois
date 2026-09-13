import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { Toast } from '../../../src/lib/components/ui/Toast/index.js';

/**
 * The site says what happened, in the past tense or as a fact: "On the feed."
 * "Link copied." The toast is an ink slab with a breathing pad at its left, and
 * it is announced once rather than interrupting whatever somebody is reading.
 */
afterEach(() => vi.useRealTimers());

describe('Toast', () => {
  const toastOf = container => container.querySelector('.toast');

  it('is announced as a status, which speaks without taking the focus', () => {
    const { container } = render(Toast, { message: 'Link copied.' });
    const toast = toastOf(container);
    expect(toast.getAttribute('role')).toBe('status');
    expect(toast.getAttribute('aria-live')).toBe('polite');
  });

  it('sets its first words in the display face and the rest beside them', () => {
    const { container } = render(Toast, { lead: 'On the feed.', message: 'Students can see it now.' });
    expect(container.querySelector('.toast b').textContent).toBe('On the feed.');
    expect(container.textContent).toContain('Students can see it now.');
  });

  it('breathes in signal for an event going live', () => {
    const { container } = render(Toast, { message: 'Happening now.' });
    const pad = container.querySelector('.pad');
    expect(pad.classList.contains('breathing')).toBe(true);
    expect(pad.getAttribute('style')).toContain('--h: var(--signal)');
  });

  it('breathes in primary for a link made, because a link is not a moment', () => {
    const { container } = render(Toast, { message: 'Linked. Discord will hear from us now.', tone: 'primary' });
    expect(container.querySelector('.pad').getAttribute('style')).toContain('--h: var(--primary)');
  });

  it('stays for six seconds and then goes', async () => {
    vi.useFakeTimers();
    let gone = 0;
    const { container } = render(Toast, { message: 'Link copied.', ondismiss: () => { gone += 1; } });
    expect(toastOf(container)).toBeTruthy();
    vi.advanceTimersByTime(5999);
    expect(gone).toBe(0);
    vi.advanceTimersByTime(2);
    expect(gone).toBe(1);
  });

  it('goes when it is dismissed, without waiting out the six seconds', async () => {
    let gone = 0;
    const { getByRole } = render(Toast, { message: 'Link copied.', ondismiss: () => { gone += 1; } });
    await fireEvent.click(getByRole('button', { name: /dismiss/i }));
    expect(gone).toBe(1);
  });

  it('stays until it is dismissed when it is told to wait', () => {
    vi.useFakeTimers();
    let gone = 0;
    render(Toast, { message: 'The feed did not load. Try again in a moment.', duration: 0, ondismiss: () => { gone += 1; } });
    vi.advanceTimersByTime(60000);
    expect(gone).toBe(0);
  });

  it('is cut at the top right and floats, which is the one level that casts a shadow', () => {
    const { container } = render(Toast, { message: 'Link copied.' });
    const toast = toastOf(container);
    expect(toast.classList.contains('cut')).toBe(true);
    expect(toast.getAttribute('style')).toContain('--cut: 10px');
  });
});
