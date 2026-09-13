import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Terms from '../../src/routes/Terms.svelte';

/**
 * The terms are a reading page: a title, the dates, and then the document. The
 * numbered sections are what the document refers to itself by, in section 13
 * and in the first paragraph, so their order is held here.
 */
describe('the terms of use', () => {
  it('is one document with one title', () => {
    const { container } = render(Terms);
    expect(screen.getByRole('heading', { name: 'Terms of Use', level: 1 })).toBeTruthy();
    expect(container.querySelectorAll('h1').length).toBe(1);
  });

  it('says when it took effect, in mono', () => {
    const { container } = render(Terms);
    const dateline = container.querySelector('.dateline');
    expect(dateline.textContent).toMatch(/Effective September 1, 2026/);
    expect(dateline.classList.contains('mono')).toBe(true);
  });

  it('numbers its sections in order, with none repeated', () => {
    render(Terms);
    const numbers = [...document.body.textContent.matchAll(/(?:^|\s)(\d{1,2})\.\s[A-Z]/g)]
      .map(match => Number(match[1]));
    expect(numbers.length).toBeGreaterThan(10);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('leads to the privacy policy, which it refers to', () => {
    const { container } = render(Terms);
    expect([...container.querySelectorAll('a')].some(a => a.getAttribute('href') === '/privacy')).toBe(true);
  });

  /** The review checklist: no card, no shadow, no utility soup. */
  it('is drawn as prose rather than as a stack of cards', () => {
    const { container } = render(Terms);
    expect(container.innerHTML).not.toMatch(/rounded-xl|bg-background|backdrop-blur|text-muted-foreground/);
  });
});
