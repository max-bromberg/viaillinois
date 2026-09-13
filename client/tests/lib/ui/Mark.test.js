import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { Mark } from '../../../src/lib/components/ui/Mark/index.js';

/**
 * The mark is the one thing about the site the redesign was told not to touch.
 * docs/design/03-the-look.md: it is never recolored, outlined, rotated or placed
 * inside a container, and the one variation it takes is white, on the kiosk and
 * on the night sky, where its own teal would disappear.
 *
 * It is drawn here rather than loaded as an image because an image cannot be
 * given that white.
 */
describe('Mark', () => {
  const markOf = container => container.querySelector('svg.mark');

  it('is the three strokes, at the proportions it has always had', () => {
    const { container } = render(Mark);
    const mark = markOf(container);
    expect(mark.getAttribute('viewBox')).toBe('0 0 1060 476');
    expect(mark.querySelectorAll('path').length).toBe(3);
  });

  it('is drawn in its own teal, which is a token rather than a value typed in', () => {
    const { container } = render(Mark);
    expect(markOf(container).getAttribute('fill')).toBe('var(--mark)');
  });

  it('is white on the kiosk and on the night sky, which is the one variation it takes', () => {
    const { container } = render(Mark, { onDark: true });
    expect(markOf(container).getAttribute('fill')).toBe('#ffffff');
  });

  it('says the site name, since the mark is the site name', () => {
    const { container } = render(Mark);
    const mark = markOf(container);
    expect(mark.getAttribute('role')).toBe('img');
    expect(mark.getAttribute('aria-label')).toBe('VIA');
  });

  it('keeps its proportions at whatever width it is drawn', () => {
    const { container } = render(Mark, { size: 100 });
    const mark = markOf(container);
    expect(mark.getAttribute('width')).toBe('100');
    expect(Number(mark.getAttribute('height'))).toBeCloseTo((100 * 476) / 1060, 3);
  });

  it('is in no container of its own, and takes no border or background', () => {
    const { container } = render(Mark);
    expect(container.firstElementChild.tagName.toLowerCase()).toBe('svg');
    expect(markOf(container).getAttribute('style') ?? '').not.toMatch(/border|background/);
  });
});
