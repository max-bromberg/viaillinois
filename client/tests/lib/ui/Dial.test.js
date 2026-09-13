import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { Dial } from '../../../src/lib/components/ui/Dial/index.js';

/**
 * The theme control. A pill holding a sun, a pad, the current mode's name and a
 * moon. The pad sits beside the active mode and slides when the mode changes,
 * which is the fifth of the five movements.
 *
 * docs/design/09-accessibility.md: icons never appear without a label, except in
 * the dial, where each icon has an accessible name of its own. This is the one
 * place that exception is taken, so it is the one place it is checked.
 */
describe('Dial', () => {
  const dialOf = container => container.querySelector('.dial');

  it('is a group of three stops, and says which it is', () => {
    const { container } = render(Dial, { mode: 'auto' });
    const dial = dialOf(container);
    expect(dial.getAttribute('role')).toBe('radiogroup');
    expect(dial.getAttribute('aria-label')).toBe('Color theme');
    expect(container.querySelectorAll('[role="radio"]').length).toBe(3);
  });

  it('gives the sun and the moon a name each, which is the exception the dial takes', () => {
    const { getByRole } = render(Dial, { mode: 'auto' });
    expect(getByRole('radio', { name: 'Light' })).toBeTruthy();
    expect(getByRole('radio', { name: 'Dark' })).toBeTruthy();
    expect(getByRole('radio', { name: /system/i })).toBeTruthy();
  });

  it.each([
    ['light', 'Light'],
    ['auto', 'Auto'],
    ['dark', 'Dark'],
  ])('shows the name of the mode it is in when it is %s', (mode, name) => {
    const { container } = render(Dial, { mode });
    expect(container.querySelector('.dial b').textContent).toBe(name);
  });

  it.each(['light', 'auto', 'dark'])('puts the pad beside the active mode when it is %s', mode => {
    const { container } = render(Dial, { mode });
    const stops = [...container.querySelectorAll('[role="radio"]')];
    const withPad = stops.filter(stop => stop.querySelector('.pad'));
    expect(withPad.length).toBe(1);
    expect(withPad[0].getAttribute('aria-checked')).toBe('true');
  });

  it('marks exactly one stop as chosen', () => {
    const { container } = render(Dial, { mode: 'dark' });
    const chosen = [...container.querySelectorAll('[role="radio"]')].filter(
      stop => stop.getAttribute('aria-checked') === 'true',
    );
    expect(chosen.length).toBe(1);
  });

  it('reports the mode it is turned to', async () => {
    const seen = [];
    const { getByRole } = render(Dial, { mode: 'auto', onchange: next => seen.push(next) });
    await fireEvent.click(getByRole('radio', { name: 'Dark' }));
    expect(seen).toEqual(['dark']);
  });

  it('turns with the arrow keys, as a group of stops should', async () => {
    const seen = [];
    const { getByRole } = render(Dial, { mode: 'auto', onchange: next => seen.push(next) });
    await fireEvent.keyDown(getByRole('radio', { name: /system/i }), { key: 'ArrowRight' });
    expect(seen).toEqual(['dark']);
  });

  it('stops at the ends rather than wrapping round, since the ends mean something', async () => {
    const seen = [];
    const { getByRole } = render(Dial, { mode: 'light', onchange: next => seen.push(next) });
    await fireEvent.keyDown(getByRole('radio', { name: 'Light' }), { key: 'ArrowLeft' });
    expect(seen).toEqual([]);
  });

  it('lets the keyboard reach the chosen stop and skip past the others', () => {
    const { container } = render(Dial, { mode: 'dark' });
    const stops = [...container.querySelectorAll('[role="radio"]')];
    expect(stops.map(stop => stop.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
  });
});

/**
 * The fifth movement.
 *
 * docs/design/06-shape-space-motion.md: the dial turns, and the pad slides along
 * the dial over 400 milliseconds rather than snapping. The pad is drawn inside
 * whichever stop is active, so changing the mode destroyed it in one stop and
 * built it in the next, and it jumped. It is put back where the old one was and
 * moved to where it belongs instead, which reads as one pad travelling and costs
 * the layout nothing.
 *
 * A layout engine is what decides where a stop is, and there is none here, so
 * the positions are given rather than measured.
 */
describe('the dial turning', () => {
  const realRect = Element.prototype.getBoundingClientRect;
  const realAnimate = Element.prototype.animate;
  const realMatchMedia = window.matchMedia;

  /** Each pad that is drawn sits further along the dial than the one before. */
  function dialWithPositions() {
    const calls = [];
    let left = 0;
    Element.prototype.getBoundingClientRect = function rect() {
      if (!this.classList?.contains('pad')) return { left: 0, top: 0, width: 0, height: 0 };
      left += 40;
      return { left, top: 0, width: 12, height: 12 };
    };
    Element.prototype.animate = function animate(frames, options) {
      calls.push({ frames, options });
      return { finished: Promise.resolve(), cancel() {} };
    };
    return calls;
  }

  afterEach(() => {
    Element.prototype.getBoundingClientRect = realRect;
    if (realAnimate) Element.prototype.animate = realAnimate;
    else delete Element.prototype.animate;
    window.matchMedia = realMatchMedia;
  });

  it('slides the pad from where it was over four hundred milliseconds', async () => {
    const calls = dialWithPositions();
    const { rerender } = render(Dial, { mode: 'auto' });
    // The first draw has nowhere to come from, so nothing moves.
    expect(calls).toHaveLength(0);
    await rerender({ mode: 'dark' });
    expect(calls).toHaveLength(1);
    expect(calls[0].options.duration).toBe(400);
    expect(calls[0].frames[0].transform).toBe('translateX(-40px)');
    expect(calls[0].frames[1].transform).toBe('none');
  });

  it('holds still for anybody who asks for stillness', async () => {
    const calls = dialWithPositions();
    window.matchMedia = query => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    });
    const { rerender } = render(Dial, { mode: 'auto' });
    await rerender({ mode: 'dark' });
    expect(calls).toHaveLength(0);
  });
});
