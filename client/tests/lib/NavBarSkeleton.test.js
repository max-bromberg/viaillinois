import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import NavBarSkeleton from '../../src/lib/NavBarSkeleton.svelte';

/**
 * The shape of the sky band, before the page knows anything.
 *
 * The sky is the one thing about the page that is already known, because it is
 * decided by the clock rather than by anything the platform has to answer, so
 * the band is drawn for real and only the words are left as shapes.
 */
describe('NavBarSkeleton', () => {
  it('draws the sky band, which the clock already knows', () => {
    const { container } = render(NavBarSkeleton);
    const band = container.querySelector('header.skyband');
    expect(band).toBeTruthy();
    expect(band.getAttribute('style')).toContain('--sky');
  });

  it('leaves the shapes of the navigation and the greeting where the words will be', () => {
    const { container } = render(NavBarSkeleton);
    expect(container.querySelector('.nav')).toBeTruthy();
    expect(container.querySelectorAll('.link').length).toBe(4);
    expect(container.querySelector('.greet')).toBeTruthy();
  });

  it('does not shimmer', () => {
    const { container } = render(NavBarSkeleton);
    expect(container.innerHTML).not.toContain('shimmer');
  });

  it('says nothing to a screen reader, because there is nothing to say yet', () => {
    const { container } = render(NavBarSkeleton);
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
    expect(container.textContent.trim()).toBe('');
  });
});
