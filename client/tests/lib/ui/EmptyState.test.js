import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { EmptyState } from '../../../src/lib/components/ui/EmptyState/index.js';

/**
 * An empty list says what is nearby and what to do, never "No results found".
 * It is drawn on the dusk sky, which is the one place a sky appears below the
 * band, and it is cut at 22 px.
 */
describe('EmptyState', () => {
  it('says what is here and then what is nearby', () => {
    const { container } = render(EmptyState, {
      lead: 'Nothing on tonight.',
      children: undefined,
      say: 'Thursday has two events and Friday has the Texas Instruments session.',
    });
    expect(container.querySelector('.empty b').textContent).toBe('Nothing on tonight.');
    expect(container.querySelector('.empty p').textContent).toContain('Thursday has two events');
  });

  it('is drawn on the dusk sky and cut at 22 px', () => {
    const { container } = render(EmptyState, { lead: 'Nothing on tonight.' });
    const empty = container.querySelector('.empty');
    expect(empty.classList.contains('cut')).toBe(true);
    expect(empty.getAttribute('style')).toContain('--cut: 22px');
  });

  it('carries no heading of its own, because it is not a section of the page', () => {
    const { container } = render(EmptyState, { lead: 'Nothing on tonight.' });
    expect(container.querySelector('h1, h2, h3, h4, h5, h6')).toBe(null);
  });
});
