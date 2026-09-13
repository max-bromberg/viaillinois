import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { Cut } from '../../../src/lib/components/ui/Cut/index.js';

/**
 * The cut is the site's corner. It goes wrong in one specific way: a clipped box
 * loses its border along the diagonal, so an outlined cut has to be two
 * chamfered layers rather than one box with a border on it. That is what these
 * check, because a cut that reads as a gap rather than a corner is the defect
 * the design review caught twice.
 */
describe('Cut', () => {
  it('cuts the top right by default, which is the common case', () => {
    const { container } = render(Cut);
    const shape = container.querySelector('div');
    expect(shape.classList.contains('cut')).toBe(true);
    expect(shape.classList.contains('cutbl')).toBe(false);
  });

  it('cuts the bottom left for the sky band and the masthead', () => {
    const { container } = render(Cut, { corner: 'bottom-left' });
    expect(container.querySelector('div').classList.contains('cutbl')).toBe(true);
  });

  it('takes the size of chamfer it is given', () => {
    const { container } = render(Cut, { size: 44 });
    expect(container.querySelector('div').getAttribute('style')).toContain('--cut: 44px');
  });

  it('draws an outlined cut as two layers rather than as a box with a border', () => {
    const { container } = render(Cut, { outlined: true, size: 10, edge: 'var(--ink)', fill: 'var(--paper)' });
    const shape = container.querySelector('div');
    expect(shape.classList.contains('ocut')).toBe(true);
    // The outer layer is the border colour and the inner layer is the fill. The
    // stylesheet insets the inner layer by the border width on every edge.
    const style = shape.getAttribute('style');
    expect(style).toContain('--oc: var(--ink)');
    expect(style).toContain('--ofill: var(--paper)');
    expect(style).toContain('--w: 1.5px');
    expect(style).toContain('--c: 10px');
  });

  it('takes a border width, which is how focus gives the ring the shape of the button', () => {
    const { container } = render(Cut, { outlined: true, width: 3 });
    expect(container.querySelector('div').getAttribute('style')).toContain('--w: 3px');
  });

  it('draws whatever element it is asked for', () => {
    const { container } = render(Cut, { as: 'header' });
    expect(container.querySelector('header')).toBeTruthy();
  });
});
