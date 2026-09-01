import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import MidtermRowSkeleton from '../../src/lib/MidtermRowSkeleton.svelte';

describe('MidtermRowSkeleton', () => {
  it('renders a table row', () => {
    const { container } = render(MidtermRowSkeleton);
    expect(container.querySelector('tr')).toBeTruthy();
  });

  // Exam, time, location and status. The votes column went with crowdsourcing.
  it('renders one cell per column of the midterm table', () => {
    const { container } = render(MidtermRowSkeleton);
    expect(container.querySelectorAll('td').length).toBe(4);
  });

  it('renders shimmer elements', () => {
    const { container } = render(MidtermRowSkeleton);
    expect(container.querySelectorAll('.shimmer').length).toBeGreaterThanOrEqual(4);
  });
});
