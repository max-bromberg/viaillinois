import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { Switch } from '../../../src/lib/components/ui/Switch/index.js';

/**
 * A switch is a track and a pad, and the pad is the same shape as every other
 * pad on the site. Meaning never rides on colour alone, so the state is in the
 * position of the pad and in what the control tells a screen reader, not only in
 * whether the track is teal.
 */
describe('Switch', () => {
  const switchOf = container => container.querySelector('.tswitch');

  it('is a switch, and says which it is', () => {
    const { container } = render(Switch, { label: 'Show internal events' });
    const control = switchOf(container);
    expect(control.getAttribute('role')).toBe('switch');
    expect(control.getAttribute('aria-checked')).toBe('false');
    expect(control.getAttribute('aria-label')).toBe('Show internal events');
  });

  it('slides the pad across and turns the track on when it is on', () => {
    const { container } = render(Switch, { label: 'Show internal events', checked: true });
    const control = switchOf(container);
    expect(control.classList.contains('on')).toBe(true);
    expect(control.getAttribute('aria-checked')).toBe('true');
  });

  it('reports being turned on and off', async () => {
    const seen = [];
    const { container } = render(Switch, { label: 'Show internal events', onchange: next => seen.push(next) });
    await fireEvent.click(switchOf(container));
    expect(seen).toEqual([true]);
  });

  it('answers the keyboard, because a switch that only answers a mouse is not a control', async () => {
    const seen = [];
    const { container } = render(Switch, { label: 'Show internal events', onchange: next => seen.push(next) });
    const control = switchOf(container);
    // Space turns it on, enter turns it back off, because both keys work the
    // control rather than each having a direction of its own.
    await fireEvent.keyDown(control, { key: ' ' });
    await fireEvent.keyDown(control, { key: 'Enter' });
    expect(seen).toEqual([true, false]);
  });

  it('is reachable by the keyboard at all', () => {
    const { container } = render(Switch, { label: 'Show internal events' });
    expect(switchOf(container).getAttribute('tabindex')).toBe('0');
  });

  it('does not answer while it is disabled', async () => {
    const seen = [];
    const { container } = render(Switch, { label: 'Show internal events', disabled: true, onchange: next => seen.push(next) });
    await fireEvent.click(switchOf(container));
    expect(seen).toEqual([]);
    expect(switchOf(container).getAttribute('aria-disabled')).toBe('true');
  });

  it('carries exactly one pad, which is the thumb', () => {
    const { container } = render(Switch, { label: 'Show internal events' });
    expect(container.querySelectorAll('.pad').length).toBe(1);
  });
});
