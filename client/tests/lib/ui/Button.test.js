import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { Button } from '../../../src/lib/components/ui/Button/index.js';

/**
 * A button says exactly what happens. Its shape is the cut, taken from the end
 * of the strokes in the mark, and an outlined one is two chamfered layers rather
 * than a box with a border, because a clipped box loses its border along the
 * diagonal. Focus thickens that border layer, which is what gives the ring the
 * button's own shape.
 */
describe('Button', () => {
  const buttonOf = container => container.querySelector('.btn');

  it('is a secondary button by default, cut at the top right', () => {
    const { container } = render(Button, { children: undefined });
    const button = buttonOf(container);
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.classList.contains('secondary')).toBe(true);
    expect(button.classList.contains('cut')).toBe(true);
  });

  it.each([
    ['primary', ['primary', 'cut']],
    ['secondary', ['secondary', 'cut']],
    ['danger', ['danger', 'cut']],
  ])('draws the %s variant with the cut', (variant, expected) => {
    const { container } = render(Button, { variant });
    for (const className of expected) {
      expect(buttonOf(container).classList.contains(className), className).toBe(true);
    }
  });

  /**
   * The quiet button is the one variant with no fill and no cut. It carries a
   * filled primary pad before its label instead, which is the same shape doing
   * the same job one level down.
   */
  it('draws the quiet variant with a pad and no cut', () => {
    const { container } = render(Button, { variant: 'quiet' });
    const button = buttonOf(container);
    expect(button.classList.contains('quiet')).toBe(true);
    expect(button.classList.contains('cut')).toBe(false);
    expect(button.querySelector('.pad')).toBeTruthy();
  });

  it('takes the small size, which has a smaller cut to match', () => {
    const { container } = render(Button, { size: 'sm' });
    expect(buttonOf(container).classList.contains('sm')).toBe(true);
  });

  it('is a link when it is given somewhere to go, and still looks like a button', () => {
    const { container } = render(Button, { href: '/midterms' });
    const button = buttonOf(container);
    expect(button.tagName).toBe('A');
    expect(button.getAttribute('href')).toBe('/midterms');
    expect(button.getAttribute('type')).toBe(null);
  });

  it('carries an icon beside its label without the icon speaking twice', () => {
    const { container } = render(Button, { icon: 'cal' });
    const icon = container.querySelector('svg.i');
    expect(icon).toBeTruthy();
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('reports being pressed', async () => {
    let pressed = 0;
    const { container } = render(Button, { onclick: () => { pressed += 1; } });
    await fireEvent.click(buttonOf(container));
    expect(pressed).toBe(1);
  });

  it('does not report being pressed while it is disabled', async () => {
    let pressed = 0;
    const { container } = render(Button, { disabled: true, onclick: () => { pressed += 1; } });
    await fireEvent.click(buttonOf(container));
    expect(pressed).toBe(0);
    expect(buttonOf(container).disabled).toBe(true);
  });

  it('says it is working, and stops answering, while it is working', () => {
    const { container } = render(Button, { busy: true });
    const button = buttonOf(container);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);
  });

  it('says what it fills with when it stands on a card rather than on paper', () => {
    const { container } = render(Button, { on: 'card' });
    expect(buttonOf(container).parentElement.classList.contains('on-card')).toBe(true);
  });
});
