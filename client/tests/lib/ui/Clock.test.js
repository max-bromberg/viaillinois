import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { Clock } from '../../../src/lib/components/ui/Clock/index.js';

/**
 * The clock in the sky band, and the same clock on the kiosk, because the lobby
 * has none of its own. It is set in the thinnest condensed cut at the largest
 * size, with the meridiem small beside it and the date in mono under it.
 *
 * Every time on the site is campus time. Rendered in the reader's own zone, the
 * same event showed one hour to a student in a lecture hall and another to the
 * same student reading it from home over the winter break.
 */
describe('Clock', () => {
  const AT = '2026-09-10T18:41:00-05:00';

  it('sets the hour and minute large and the meridiem small beside it', () => {
    const { container } = render(Clock, { at: AT });
    expect(container.querySelector('.t').textContent.replace(/\s+/g, '')).toBe('6:41PM');
    expect(container.querySelector('.t small').textContent).toBe('PM');
  });

  it('reads the clock on campus, wherever it is being read', () => {
    const { container } = render(Clock, { at: AT });
    // The same instant, written with a different offset, is the same campus hour.
    const { container: elsewhere } = render(Clock, { at: '2026-09-10T23:41:00Z' });
    expect(elsewhere.querySelector('.t').textContent).toBe(container.querySelector('.t').textContent);
  });

  it('carries a machine readable time as well as a legible one', () => {
    const { container } = render(Clock, { at: AT });
    const time = container.querySelector('time');
    expect(time).toBeTruthy();
    expect(time.getAttribute('datetime')).toContain('2026-09-10');
  });

  it('says the date and where it is, under the time', () => {
    const { container } = render(Clock, { at: AT });
    expect(container.querySelector('.d').textContent).toContain('Thu Sep 10');
    expect(container.querySelector('.d').textContent).toContain('Urbana');
  });

  it('says which sky it is under when it is told, because the band is the site clock', () => {
    const { container } = render(Clock, { at: AT, sky: 'dusk' });
    expect(container.querySelector('.d').textContent).toContain('dusk over ECEB');
  });

  it('draws nothing rather than a wrong time when it is given no time', () => {
    const { container } = render(Clock, { at: null });
    expect(container.querySelector('.clock')).toBe(null);
  });
});
