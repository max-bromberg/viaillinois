import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { Icon, ICONS } from '../../../src/lib/components/ui/Icon/index.js';

/**
 * Icons, drawn rather than typed.
 *
 * The first version of the site used emoji as icons, which draw differently on
 * every platform and gave the page a different face on a phone than on the lobby
 * screen. These are the eight shapes the reference render uses, at the same
 * stroke weight as the traces in the mark.
 *
 * docs/design/09-accessibility.md: an icon never appears without a label. Where
 * a label sits beside it in the interface the icon is decoration and says so;
 * where it stands alone it carries the label itself.
 */
describe('Icon', () => {
  it('draws every shape the reference render uses', () => {
    expect(Object.keys(ICONS).sort()).toEqual(['arrow', 'back', 'bolt', 'cal', 'moon', 'next', 'pin', 'prev', 'share', 'sun']);
  });

  it('draws the shape it is asked for', () => {
    const { container } = render(Icon, { name: 'pin' });
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.innerHTML).toContain('M12 21s-6-5.4-6-10a6 6 0 0 1 12 0c0 4.6-6 10-6 10z');
  });

  it('is decoration when a label sits beside it in the interface', () => {
    const { container } = render(Icon, { name: 'pin' });
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBe(null);
  });

  it('carries its own label when it stands alone', () => {
    const { container } = render(Icon, { name: 'share', label: 'Share this event' });
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('aria-hidden')).toBe(null);
    expect(svg.getAttribute('role')).toBe('img');
    expect(container.querySelector('title').textContent).toBe('Share this event');
  });

  it('takes the stroke from the text it sits in, so it is never a colour of its own', () => {
    const { container } = render(Icon, { name: 'cal' });
    const svg = container.querySelector('svg');
    expect(svg.classList.contains('i')).toBe(true);
    expect(svg.getAttribute('style') ?? '').not.toMatch(/#[0-9a-f]{3}/i);
  });

  it('sizes itself from the type it sits in unless it is told otherwise', () => {
    const { container } = render(Icon, { name: 'cal', size: 15 });
    expect(container.querySelector('svg').getAttribute('style')).toContain('font-size: 15px');
  });

  it('refuses a shape it does not have, rather than drawing nothing', () => {
    expect(() => render(Icon, { name: 'sparkles' })).toThrow();
  });
});

/**
 * A direction needs a shape that points.
 *
 * The calendar's Previous and Next controls were quiet buttons, and a quiet
 * button draws a pad. Both drew the same pad, so neither said which way it
 * went: the only thing distinguishing them was the word. The existing arrow
 * and back shapes are a long shaft with a head, which reads as "go to" rather
 * than "step one along" and is faint at the size a control like this uses.
 *
 * These are chevrons on the chamfer's own 45 degrees, which is the angle the
 * cut takes on every card, button and band in the design.
 */
describe('the direction shapes', () => {
  it('offers a chevron each way', () => {
    const { container } = render(Icon, { name: 'next' });
    expect(container.querySelector('svg.i path')).toBeTruthy();
  });

  it('draws them as mirror images of one another', () => {
    const next = render(Icon, { name: 'next' }).container.querySelector('path').getAttribute('d');
    const prev = render(Icon, { name: 'prev' }).container.querySelector('path').getAttribute('d');
    expect(next).toBeTruthy();
    expect(prev).toBeTruthy();
    expect(prev).not.toBe(next);
  });
});
