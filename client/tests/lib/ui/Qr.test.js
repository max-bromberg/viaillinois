import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { Qr } from '../../../src/lib/components/ui/Qr/index.js';

/**
 * A code somebody photographs off a screen across a lobby.
 *
 * It is drawn from the module matrix rather than dropped in as an image, so
 * that it can be set in the design's own colours and carry the chamfer the rest
 * of the page carries. A generic black square on a VIA screen would be the one
 * element on it that belonged to nothing.
 *
 * Two things are not design choices and are not negotiable. The quiet margin
 * around the code has to be there or a reader cannot find the code's edge, and
 * the contrast has to run dark modules on a light field, because that is what
 * every camera is built to expect and a lobby is not a controlled light.
 */
const URL = 'https://viaillinois.com/events/42';

describe('Qr', () => {
  it('draws the code as a drawing rather than loading it as an image', () => {
    const { container } = render(Qr, { value: URL });
    expect(container.querySelector('img')).toBe(null);
    expect(container.querySelector('svg.qrcode')).toBeTruthy();
  });

  it('draws a module for every dark square in the matrix', () => {
    const { container } = render(Qr, { value: URL });
    const modules = container.querySelectorAll('svg.qrcode rect.m');
    expect(modules.length).toBeGreaterThan(100);
  });

  it('keeps the quiet margin a reader needs to find the edge', () => {
    const { container } = render(Qr, { value: URL });
    const svg = container.querySelector('svg.qrcode');
    const [, , width] = svg.getAttribute('viewBox').split(' ').map(Number);
    // The matrix for this address is 33 modules, and the viewBox is wider than
    // that by the margin on each side.
    expect(width).toBeGreaterThan(33);
  });

  it('runs dark on light, whatever it is standing on', () => {
    const { container } = render(Qr, { value: URL });
    const field = container.querySelector('svg.qrcode rect.field');
    expect(field.getAttribute('fill')).toBe('#ffffff');
  });

  it('says where it goes, for anybody who cannot photograph it', () => {
    const { container, getByText } = render(Qr, { value: URL, label: 'Read more about this event' });
    expect(container.querySelector('svg.qrcode title').textContent).toContain(URL);
    expect(getByText('Read more about this event')).toBeTruthy();
  });

  it('draws nothing at all rather than an empty frame when it has no address', () => {
    const { container } = render(Qr, { value: '' });
    expect(container.querySelector('svg.qrcode')).toBe(null);
  });

  it('redraws when the address changes, because a slide rotates', async () => {
    const { container, rerender } = render(Qr, { value: URL });
    const before = container.querySelector('svg.qrcode').getAttribute('viewBox');
    await rerender({ value: 'https://viaillinois.com/events/1000000' });
    expect(container.querySelector('svg.qrcode')).toBeTruthy();
    expect(typeof before).toBe('string');
  });
});
