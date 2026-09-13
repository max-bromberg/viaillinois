import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { Lamp } from '../../../src/lib/components/ui/Lamp/index.js';

/**
 * Colour on VIA arrives from somewhere. The lamp is an organization's colour
 * falling across a row from its top left corner, which is what replaced the
 * stripe down the edge of a card. The strengths belong to tokens rather than to
 * this component, because the colour document gives one per theme and per state.
 */
describe('Lamp', () => {
  const lampOf = container => container.querySelector('.lamp');

  it('falls from the top left at the size a row asks for', () => {
    const { container } = render(Lamp, { tone: '#297ab5' });
    const style = lampOf(container).getAttribute('style');
    expect(style).toContain('--h: #297ab5');
    expect(style).toContain('--lamp-width: 560px');
    expect(style).toContain('--lamp-height: 200px');
    expect(style).toContain('--lamp-fade: 72%');
  });

  it('takes the larger size the event page asks for', () => {
    const { container } = render(Lamp, { width: 900, height: 520 });
    const style = lampOf(container).getAttribute('style');
    expect(style).toContain('--lamp-width: 900px');
    expect(style).toContain('--lamp-height: 520px');
  });

  it('reads its strength at rest from the token, so the theme decides it', () => {
    const { container } = render(Lamp);
    expect(lampOf(container).getAttribute('style')).toContain('--lamp-strength: var(--lamp)');
  });

  it('takes the poster strength when it is given one', () => {
    const { container } = render(Lamp, { strength: 'var(--lamp-poster)' });
    expect(lampOf(container).getAttribute('style')).toContain('--lamp-strength: var(--lamp-poster)');
  });

  it('brightens under a cursor only when it is a row somebody can reach for', () => {
    const { container: still } = render(Lamp);
    expect(lampOf(still).classList.contains('reactive')).toBe(false);
    const { container: reaching } = render(Lamp, { reactive: true });
    expect(lampOf(reaching).classList.contains('reactive')).toBe(true);
  });

  it('falls on the surface it is given, so a row and the page are lit alike', () => {
    const { container } = render(Lamp, { surface: 'var(--paper)' });
    expect(lampOf(container).getAttribute('style')).toContain('--lamp-surface: var(--paper)');
  });
});
