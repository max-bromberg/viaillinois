import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { Trace } from '../../../src/lib/components/ui/Trace/index.js';

/**
 * The trace is the only ornament the system permits, because it is the mark's
 * own geometry: a line that turns at 45 degrees and ends in a pad. It goes in
 * four places and no others.
 */
describe('Trace', () => {
  const traceOf = container => container.querySelector('svg.deco');

  it('is lines that turn at 45 degrees, ending in pads', () => {
    const { container } = render(Trace);
    const trace = traceOf(container);
    expect(trace.querySelectorAll('path').length).toBe(3);
    expect(trace.querySelectorAll('circle').length).toBe(4);
  });

  it('is drawn thinly in teal, with one pad in signal where a signal is live', () => {
    const { container } = render(Trace);
    const trace = traceOf(container);
    expect(trace.getAttribute('stroke')).toBe('var(--primary)');
    expect(trace.getAttribute('stroke-width')).toBe('1.6');
    const signal = [...trace.querySelectorAll('circle')].filter(pad => pad.getAttribute('fill') === 'var(--signal)');
    expect(signal).toHaveLength(1);
  });

  it('is decoration, and stays out of the reading order', () => {
    const { container } = render(Trace);
    expect(traceOf(container).getAttribute('aria-hidden')).toBe('true');
  });

  it('takes the width and the strength it is given', () => {
    const { container } = render(Trace, { width: 640, opacity: 0.5 });
    expect(traceOf(container).getAttribute('width')).toBe('640');
    expect(traceOf(container).getAttribute('style')).toContain('opacity: 0.5');
  });

  it('carries no raw colour of its own', () => {
    const { container } = render(Trace);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
