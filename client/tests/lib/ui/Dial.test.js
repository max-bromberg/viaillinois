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

  /*
   * The middle stop used to carry the name of the current mode, so the dial
   * read "Light" in the light theme and clicking that word selected auto. It
   * carries its own name now, whatever is chosen, and which mode is on is said
   * by where the thumb is.
   */
  it.each(['light', 'auto', 'dark'])('says Auto in the middle when it is %s', mode => {
    const { container } = render(Dial, { mode });
    expect(container.querySelector('.dial b').textContent).toBe('Auto');
  });

  it.each([['light', '0'], ['auto', '1'], ['dark', '2']])(
    'stands the thumb on the active stop when it is %s',
    (mode, at) => {
      const { container } = render(Dial, { mode });
      expect(container.querySelector('.thumb').style.getPropertyValue('--at').trim()).toBe(at);
      const chosen = [...container.querySelectorAll('[aria-checked="true"]')];
      expect(chosen).toHaveLength(1);
    },
  );

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

  /*
   * The marker used to be rebuilt inside whichever stop was active, which
   * destroys it in one place and creates it in another, so it arrived with no
   * journey and had to be animated back to where it came from. There is one
   * thumb for the whole dial now and it travels by index, so the movement is a
   * transition the browser makes and there is nothing to put back.
   */
  it('moves one thumb rather than rebuilding a marker in each stop', async () => {
    const { container, rerender } = render(Dial, { mode: 'auto' });
    const before = container.querySelector('.thumb');
    expect(before.style.getPropertyValue('--at').trim()).toBe('1');

    await rerender({ mode: 'dark' });

    const after = container.querySelector('.thumb');
    expect(container.querySelectorAll('.thumb')).toHaveLength(1);
    expect(after.style.getPropertyValue('--at').trim()).toBe('2');
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

/**
 * The dial was hard to follow, and the reason was not decoration.
 *
 * The middle stop showed the name of the current mode rather than its own
 * name, so in the light theme it read "Light", and clicking it selected auto.
 * A control that says one thing and does another is worse than an unlabelled
 * one. The pad that marked the active stop also sat before that stop's icon,
 * so it read as a fourth thing in the row rather than as a marker on one of
 * the three.
 *
 * Each stop says what it is now, permanently, and what is selected is shown by
 * a thumb that sits behind it and travels when the dial is turned.
 */
describe('what each position of the dial says it does', () => {
  const stopsOf = container => [...container.querySelectorAll('[role="radio"]')];

  it('never labels a stop with a mode other than its own', () => {
    for (const mode of ['light', 'auto', 'dark']) {
      const { container } = render(Dial, { mode });
      const [light, auto, dark] = stopsOf(container);
      expect(auto.textContent.trim()).toBe('Auto');
      expect(light.textContent.trim()).not.toMatch(/Auto|Dark/);
      expect(dark.textContent.trim()).not.toMatch(/Auto|Light/);
    }
  });

  it('gives every stop a name of its own, not just the middle one', () => {
    const { container } = render(Dial, { mode: 'auto' });
    for (const stop of stopsOf(container)) {
      const said = stop.getAttribute('aria-label') ?? stop.textContent;
      expect(said.trim().length).toBeGreaterThan(0);
    }
  });

  it('selects the mode of the stop that was clicked, which the middle did not', async () => {
    const turned = [];
    const { container } = render(Dial, { mode: 'light', onchange: value => turned.push(value) });
    const [, auto, dark] = stopsOf(container);
    await fireEvent.click(auto);
    await fireEvent.click(dark);
    expect(turned).toEqual(['auto', 'dark']);
  });

  it('marks what is selected with a thumb that sits behind the stop', () => {
    const { container } = render(Dial, { mode: 'dark' });
    const thumb = container.querySelector('.thumb');
    expect(thumb).toBeTruthy();
    // The thumb travels by index rather than being rebuilt inside each stop,
    // so there is one of it and it can move.
    expect(container.querySelectorAll('.thumb').length).toBe(1);
    expect(thumb.style.getPropertyValue('--at').trim()).toBe('2');
  });

  it('moves the thumb rather than making a new one when the dial is turned', () => {
    for (const [mode, at] of [['light', '0'], ['auto', '1'], ['dark', '2']]) {
      const { container } = render(Dial, { mode });
      expect(container.querySelector('.thumb').style.getPropertyValue('--at').trim()).toBe(at);
    }
  });

  it('says which stop is chosen to anybody who cannot see the thumb', () => {
    const { container } = render(Dial, { mode: 'auto' });
    const checked = [...container.querySelectorAll('[aria-checked="true"]')];
    expect(checked).toHaveLength(1);
    expect(checked[0].getAttribute('aria-label')).toMatch(/system/i);
  });
});

/**
 * WCAG 2.5.3, Label in Name: where a control shows a word, the name a screen
 * reader and a voice control read has to contain that word. Somebody saying
 * "click Auto" was reaching for a control whose name was "Follow the system",
 * and nothing happened.
 */
describe('what the dial is called', () => {
  it('names the stop that shows a word with that word in it', () => {
    const { container } = render(Dial, { mode: 'auto' });
    const auto = [...container.querySelectorAll('.stop')]
      .find(stop => stop.textContent.trim() === 'Auto');
    expect(auto.getAttribute('aria-label')).toContain('Auto');
  });

  it('still says what following the system means', () => {
    const { container } = render(Dial, { mode: 'auto' });
    const auto = [...container.querySelectorAll('.stop')]
      .find(stop => stop.textContent.trim() === 'Auto');
    expect(auto.getAttribute('aria-label').length).toBeGreaterThan('Auto'.length);
  });
});
