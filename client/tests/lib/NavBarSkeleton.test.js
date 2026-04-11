import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import NavBarSkeleton from '../../src/lib/NavBarSkeleton.svelte';

describe('NavBarSkeleton', () => {
  it('renders a nav element with the same sticky positioning as NavBar', () => {
    const { container } = render(NavBarSkeleton);
    const nav = container.querySelector('nav.border-b.sticky');
    expect(nav).toBeTruthy();
  });

  it('renders shimmer placeholders for links and auth button', () => {
    const { container } = render(NavBarSkeleton);
    expect(container.querySelectorAll('.shimmer').length).toBeGreaterThanOrEqual(4);
  });
});
