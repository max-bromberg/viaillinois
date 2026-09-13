import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import KioskCardSkeleton from '../../src/lib/KioskCardSkeleton.svelte';

/**
 * The lobby screen while it is still asking.
 *
 * docs/design/08-surfaces.md: loading draws the shape of what is coming in well
 * colour with no shimmer, and what arrives settles into place. The screen is
 * the night sky before the first answer as well as after it, so the wait does
 * not read as a white page somebody has to walk up to and inspect.
 */
describe('KioskCardSkeleton', () => {
  it('is the night sky as the whole screen, with the stage and the rail on it', () => {
    const { container } = render(KioskCardSkeleton);
    const kiosk = container.querySelector('.kiosk');
    expect(kiosk).toBeTruthy();
    expect(kiosk.querySelector(':scope > .main')).toBeTruthy();
    expect(kiosk.querySelector(':scope > .side')).toBeTruthy();
  });

  it('draws the shape of the stage and the rail', () => {
    const { container } = render(KioskCardSkeleton);
    expect(container.querySelectorAll('.shape').length).toBeGreaterThanOrEqual(5);
  });

  /**
   * The shimmer was a gradient sliding across the page twice a second, which is
   * a movement tied to no fact about the page and is not one of the five.
   */
  it('does not shimmer', () => {
    const { container } = render(KioskCardSkeleton);
    expect(container.querySelector('.shimmer')).toBeNull();
  });

  it('says that it is still asking, rather than leaving the shapes to speak', () => {
    const { getByRole } = render(KioskCardSkeleton);
    expect(getByRole('status').textContent).toContain('reading the feed');
  });
});
