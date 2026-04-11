import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import AppSkeleton from '../../src/lib/AppSkeleton.svelte';

describe('AppSkeleton', () => {
  it('renders a sticky nav skeleton at the top', () => {
    const { container } = render(AppSkeleton);
    expect(container.querySelector('nav.border-b.sticky')).toBeTruthy();
  });

  it('renders 6 event card skeletons in the grid', () => {
    const { container } = render(AppSkeleton);
    // Each EventCardSkeleton has a .border.rounded-lg.bg-card wrapper
    const cards = container.querySelectorAll('.border.rounded-lg.bg-card');
    expect(cards.length).toBe(6);
  });

  it('renders the TagFilter sidebar placeholder', () => {
    const { container } = render(AppSkeleton);
    // Sidebar is w-56 shrink-0
    expect(container.querySelector('.w-56.shrink-0')).toBeTruthy();
  });
});
