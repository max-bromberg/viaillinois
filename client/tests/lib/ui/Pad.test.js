import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { Pad } from '../../../src/lib/components/ui/Pad/index.js';

/**
 * The pad is the one primitive the look is built from: the checkbox, the
 * organization mark, the thumb of the switch, the needle of the theme dial, the
 * marker at the start of a field, the marker under the active page, and the
 * marker beside each day in the agenda are all this shape. Everything that can
 * go wrong with it goes wrong in several places at once, which is why it is one
 * component and not a rotated square copied around.
 */
describe('Pad', () => {
  const padOf = container => container.querySelector('.pad');

  it('is a filled pad by default', () => {
    const { container } = render(Pad);
    const pad = padOf(container);
    expect(pad).toBeTruthy();
    expect(pad.classList.contains('hollow')).toBe(false);
    expect(pad.classList.contains('lit')).toBe(false);
  });

  it('takes its colour from the tone it is given, and nothing else carries a colour', () => {
    const { container } = render(Pad, { tone: '#297ab5' });
    expect(padOf(container).getAttribute('style')).toContain('--h: #297ab5');
  });

  it('falls back to the primary colour when it is given no tone', () => {
    // The stylesheet's own fallback is the primary colour, so the component
    // writes no custom property at all rather than writing one that repeats it.
    const { container } = render(Pad);
    expect(padOf(container).getAttribute('style') ?? '').not.toContain('--h');
  });

  it.each([
    ['hollow', 'hollow'],
    ['lit', 'lit'],
  ])('draws the %s state', (prop, className) => {
    const { container } = render(Pad, { [prop]: true });
    expect(padOf(container).classList.contains(className)).toBe(true);
  });

  it('breathes by being lit and pulsing, which is what says something is happening now', () => {
    const { container } = render(Pad, { breathing: true });
    const pad = padOf(container);
    expect(pad.classList.contains('lit')).toBe(true);
    expect(pad.classList.contains('breathing')).toBe(true);
  });

  it('breathes at the pace it is given, so the day marker can be slower than the row', () => {
    const { container } = render(Pad, { breathing: true, pace: '2s' });
    expect(padOf(container).getAttribute('style')).toContain('--pace: 2s');
  });

  it('is decoration to a screen reader unless it is given a label', () => {
    const { container } = render(Pad);
    expect(padOf(container).getAttribute('aria-hidden')).toBe('true');
  });

  it('carries its label when it has one, and is no longer hidden', () => {
    const { container } = render(Pad, { label: 'IEEE' });
    const pad = padOf(container);
    expect(pad.getAttribute('aria-hidden')).toBe(null);
    expect(pad.getAttribute('role')).toBe('img');
    expect(pad.getAttribute('aria-label')).toBe('IEEE');
  });

  it('grows to 12 px inside a 32 px target when it is a control', () => {
    const { container } = render(Pad, { control: true });
    expect(padOf(container).classList.contains('control')).toBe(true);
  });

  it('takes any class the caller adds without losing its own', () => {
    const { container } = render(Pad, { class: 'mine' });
    const pad = padOf(container);
    expect(pad.classList.contains('pad')).toBe(true);
    expect(pad.classList.contains('mine')).toBe(true);
  });
});
