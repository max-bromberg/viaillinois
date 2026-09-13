import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import MidtermRowSkeleton from '../../src/lib/MidtermRowSkeleton.svelte';

/**
 * Waiting draws the shape of the row it is waiting for, in well colour, with no
 * shimmer. See docs/design/08-surfaces.md, "Empty, loading and error states".
 */
describe('MidtermRowSkeleton', () => {
  it('draws the shape of an exam row', () => {
    const { container } = render(MidtermRowSkeleton);
    expect(container.querySelector('.mrow')).toBeTruthy();
  });

  // Exam, time, location and status. The votes column went with crowdsourcing.
  it('draws one block per column of the exam row', () => {
    const { container } = render(MidtermRowSkeleton);
    expect(container.querySelectorAll('.exam > .block').length).toBe(4);
  });

  it('shimmers at nothing', () => {
    const { container } = render(MidtermRowSkeleton);
    expect(container.querySelectorAll('.shimmer').length).toBe(0);
  });

  it('says nothing to a screen reader, because there is nothing to say yet', () => {
    const { container } = render(MidtermRowSkeleton);
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});

/**
 * The loading rows have to stand in the same columns as the real ones, or the
 * listing is one column narrow while it loads and everything shifts when the
 * rows arrive.
 */
describe('MidtermRowSkeleton with a delete column', () => {
  // The tick for choosing entries to remove together, and the delete control,
  // on either side of the four the listing always has.
  it('leaves room for the controls of somebody who may delete', () => {
    const { container } = render(MidtermRowSkeleton, { props: { canDelete: true } });
    expect(container.querySelector('.mrow.manage')).toBeTruthy();
    expect(container.querySelectorAll('.mrow > .block').length).toBe(2);
  });

  it('leaves them out for somebody who may not', () => {
    const { container } = render(MidtermRowSkeleton, { props: { canDelete: false } });
    expect(container.querySelector('.mrow.manage')).toBeNull();
    expect(container.querySelectorAll('.mrow > .block').length).toBe(0);
  });
});
