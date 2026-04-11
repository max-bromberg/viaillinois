import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import KioskCardSkeleton from '../../src/lib/KioskCardSkeleton.svelte';

describe('KioskCardSkeleton', () => {
  it('renders a fullscreen container', () => {
    const { container } = render(KioskCardSkeleton);
    expect(container.querySelector('.min-h-screen')).toBeTruthy();
  });

  it('renders shimmer elements for title and metadata', () => {
    const { container } = render(KioskCardSkeleton);
    expect(container.querySelectorAll('.shimmer').length).toBeGreaterThanOrEqual(5);
  });
});
