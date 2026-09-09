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

/**
 * The loading rows have to span the same columns as the real ones, or the table
 * is one cell narrow while it loads and the header shifts when the rows arrive.
 */
describe('MidtermRowSkeleton with a delete column', () => {
  // The tick for choosing entries to remove together, and the delete control,
  // on either side of the four the listing always has.
  it('renders the extra cells for someone who may delete', () => {
    const { container } = render(MidtermRowSkeleton, { props: { canDelete: true } });
    expect(container.querySelectorAll('td').length).toBe(6);
  });

  it('leaves it out for someone who may not', () => {
    const { container } = render(MidtermRowSkeleton, { props: { canDelete: false } });
    expect(container.querySelectorAll('td').length).toBe(4);
  });
});
