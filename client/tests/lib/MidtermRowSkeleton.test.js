import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import MidtermRowSkeleton from '../../src/lib/MidtermRowSkeleton.svelte';

describe('MidtermRowSkeleton', () => {
  it('renders a table row', () => {
    const { container } = render(MidtermRowSkeleton);
    expect(container.querySelector('tr')).toBeTruthy();
  });

  it('renders exactly 5 table cells', () => {
    const { container } = render(MidtermRowSkeleton);
    expect(container.querySelectorAll('td').length).toBe(5);
  });

  it('renders shimmer elements', () => {
    const { container } = render(MidtermRowSkeleton);
    expect(container.querySelectorAll('.shimmer').length).toBeGreaterThanOrEqual(6);
  });
});
