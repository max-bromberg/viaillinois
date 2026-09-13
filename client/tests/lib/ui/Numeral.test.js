import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { Numeral } from '../../../src/lib/components/ui/Numeral/index.js';

/**
 * A count is a numeral followed by its meaning in words, in one phrase, and
 * never a number inside a bordered tile with a caption under it. The tile was
 * one of the template marks the redesign set out to remove.
 */
describe('Numeral', () => {
  it('sets the number and its meaning as one phrase', () => {
    const { container } = render(Numeral, { value: 2, unit: 'tonight in ECEB' });
    expect(container.querySelector('b').textContent).toBe('2');
    expect(container.querySelector('.unit').textContent).toBe('tonight in ECEB');
    // One phrase: the meaning is inside the same element as the number, so
    // nothing can lay them out apart or read them as two things.
    expect(container.querySelector('.numeral').textContent).toBe('2tonight in ECEB');
  });

  it('puts the number in no box of its own', () => {
    const { container } = render(Numeral, { value: 12, unit: 'this week' });
    for (const node of container.querySelectorAll('*')) {
      const style = node.getAttribute('style') ?? '';
      expect(style).not.toMatch(/border|background/);
    }
  });

  it('is orange only when it is about now', () => {
    const { container: plain } = render(Numeral, { value: 12, unit: 'this week' });
    expect(plain.querySelector('b').classList.contains('hot')).toBe(false);
    const { container: now } = render(Numeral, { value: 2, unit: 'tonight in ECEB', hot: true });
    expect(now.querySelector('b').classList.contains('hot')).toBe(true);
  });

  it('takes the size it is set at, since the greeting and the type page differ', () => {
    const { container } = render(Numeral, { value: 9, unit: 'days', size: 64 });
    expect(container.querySelector('b').getAttribute('style')).toContain('font-size: 64px');
  });

  it('is just the number when it is given no meaning to carry', () => {
    const { container } = render(Numeral, { value: 7 });
    expect(container.querySelector('.unit')).toBe(null);
  });
});
