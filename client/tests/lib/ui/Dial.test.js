import { describe, it, expect } from 'vitest';
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
