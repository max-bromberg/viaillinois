import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import EventCardSkeleton from '../../src/lib/EventCardSkeleton.svelte';

describe('EventCardSkeleton', () => {
  it('renders the same card wrapper as EventCard', () => {
    const { container } = render(EventCardSkeleton);
    const card = container.querySelector('.border.rounded-lg.bg-card');
    expect(card).toBeTruthy();
  });

  it('renders shimmer placeholder elements', () => {
    const { container } = render(EventCardSkeleton);
    const shimmers = container.querySelectorAll('.shimmer');
    expect(shimmers.length).toBeGreaterThanOrEqual(8);
  });

  it('renders tag pill placeholders as rounded-full', () => {
    const { container } = render(EventCardSkeleton);
    const pills = container.querySelectorAll('.shimmer.rounded-full');
    expect(pills.length).toBe(3);
  });
});
