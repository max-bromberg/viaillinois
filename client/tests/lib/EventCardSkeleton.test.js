import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import EventCardSkeleton from '../../src/lib/EventCardSkeleton.svelte';
import EventRow from '../../src/lib/components/ui/EventRow/EventRow.svelte';

/**
 * The shape of a row, while it is on its way.
 *
 * docs/design/08-surfaces.md: loading draws the shape of the rows in well colour
 * with no shimmer, and the rows settle when they arrive. The shimmer that used
 * to run across these was motion with nothing to tell you, and motion that
 * decorates is the fastest way to make a page feel generated.
 */
describe('EventCardSkeleton', () => {
  it('draws the shape of a row, cut like one', () => {
    const { container } = render(EventCardSkeleton);
    const ghost = container.querySelector('.ghost');
    expect(ghost).toBeTruthy();
    expect(ghost.classList.contains('cut')).toBe(true);
    expect(ghost.getAttribute('style')).toContain('--cut: 14px');
  });

  it('leaves the same columns a row has, so nothing jumps when the row arrives', () => {
    const { container } = render(EventCardSkeleton);
    expect(container.querySelector('.time')).toBeTruthy();
    expect(container.querySelector('.body')).toBeTruthy();
  });

  it('does not shimmer, because a shimmer says nothing', () => {
    const { container } = render(EventCardSkeleton);
    expect(container.innerHTML).not.toContain('shimmer');
  });

  it('says nothing to a screen reader, because there is nothing to say yet', () => {
    const { container } = render(EventCardSkeleton);
    expect(container.querySelector('.ghost').getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent.trim()).toBe('');
  });

  it('is the size of the row it stands in for', () => {
    const event = {
      event_id: 1, title: 'A', start_time: '2026-09-10T18:00:00-05:00',
      end_time: '2026-09-10T20:00:00-05:00', rso_name: 'IEEE',
    };
    const { container: real } = render(EventRow, { event });
    const { container: ghost } = render(EventCardSkeleton);
    // Both are the same three column grid with the same padding, so a page of
    // ghosts is the height the page of rows will be.
    expect(getComputedStyle(real.querySelector('.ev')).display).toBe(getComputedStyle(ghost.querySelector('.ghost')).display);
  });
});
