import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { Highlight } from '../../../src/lib/components/ui/Highlight/index.js';

/**
 * A tag and a status are words with a marker stroke under them, because the site
 * has no filled pills. A tag filter is also a control, and a control that looks
 * like a word still has to say what it is and whether it is on.
 */
describe('Highlight', () => {
  it('is a plain span when it is a status, which nobody presses', () => {
    const { container } = render(Highlight, { tone: 'var(--danger)' });
    const word = container.querySelector('.hl');
    expect(word.tagName).toBe('SPAN');
    expect(word.getAttribute('aria-pressed')).toBe(null);
    expect(word.getAttribute('style')).toContain('--h: var(--danger)');
  });

  it('is a button that says whether it is on when it is a tag filter', () => {
    const { container } = render(Highlight, { tone: 'var(--cat-3)', pressed: true });
    const word = container.querySelector('.hl');
    expect(word.tagName).toBe('BUTTON');
    expect(word.getAttribute('type')).toBe('button');
    expect(word.getAttribute('aria-pressed')).toBe('true');
  });

  it('says it is off when it is off, rather than saying nothing', () => {
    const { container } = render(Highlight, { pressed: false });
    expect(container.querySelector('.hl').getAttribute('aria-pressed')).toBe('false');
  });

  it('drops the stroke for a dotted hairline when it is unselected', () => {
    const { container } = render(Highlight, { off: true });
    expect(container.querySelector('.hl').classList.contains('off')).toBe(true);
  });

  it('reports being pressed', async () => {
    let pressed = 0;
    const { container } = render(Highlight, { pressed: false, onclick: () => { pressed += 1; } });
    await fireEvent.click(container.querySelector('.hl'));
    expect(pressed).toBe(1);
  });
});
