import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import AppSkeleton from '../../src/lib/AppSkeleton.svelte';

/**
 * The whole page, before the answer to who is looking has come back.
 *
 * It draws the shapes the feed is about to be, so that nothing moves sideways
 * when the events arrive. A skeleton that draws a different layout from the page
 * it stands in for is worse than none at all.
 */
describe('AppSkeleton', () => {
  it('draws the sky band at the top', () => {
    const { container } = render(AppSkeleton);
    expect(container.querySelector('header.skyband')).toBeTruthy();
  });

  it('lays the page out as the feed lays it out, a rail beside an agenda', () => {
    const { container } = render(AppSkeleton);
    const page = container.querySelector('.page');
    expect(page).toBeTruthy();
    expect(page.querySelector('.rail')).toBeTruthy();
    expect(page.querySelector('.agenda')).toBeTruthy();
  });

  it('draws the shape of six rows', () => {
    const { container } = render(AppSkeleton);
    expect(container.querySelectorAll('.agenda .ghost.cut').length).toBe(6);
  });

  it('does not shimmer anywhere', () => {
    const { container } = render(AppSkeleton);
    expect(container.innerHTML).not.toContain('shimmer');
  });

  it('says nothing to a screen reader, because there is nothing to say yet', () => {
    const { container } = render(AppSkeleton);
    expect(container.textContent.trim()).toBe('');
  });
});
