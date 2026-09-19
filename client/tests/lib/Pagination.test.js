import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Pagination from '../../src/lib/Pagination.svelte';
import { borrowedIn } from '../support/designClasses.js';

/**
 * The pager above and below the agenda.
 *
 * Every page number carried class="page", and .page is the site's own page
 * grid: two columns of 200px and a fraction, a 36px gap and 28px of padding.
 * Each number was therefore drawn as a page layout rather than as a button,
 * which is why the row read as oddly spaced and in a format nobody designed.
 */
describe('Pagination', () => {
  const pager = (props = {}) =>
    render(Pagination, { props: { currentPage: 2, totalPages: 5, ...props } });

  it('names no element with a class the design system claims globally', () => {
    const { container } = pager();
    expect(borrowedIn(container)).toEqual([]);
  });

  it('offers a way to every page, and says which one is open', () => {
    const { container } = pager();
    const current = container.querySelector('[aria-current="page"]');
    expect(current.textContent.trim()).toBe('2');
    expect(container.querySelectorAll('[aria-current="page"]').length).toBe(1);
  });

  it('does not offer a step back from the first page, or on from the last', () => {
    const first = pager({ currentPage: 1 });
    expect(first.container.querySelector('.step').disabled).toBe(true);

    const last = pager({ currentPage: 5 });
    const steps = last.container.querySelectorAll('.step');
    expect(steps[steps.length - 1].disabled).toBe(true);
  });

  it('draws nothing at all when everything fits on one page', () => {
    const { container } = pager({ currentPage: 1, totalPages: 1 });
    expect(container.querySelector('.pager')).toBe(null);
  });
});

/**
 * WCAG 2.5.3, Label in Name. The two step buttons read Back and Next and were
 * named "The page before this one" and "The page after this one", so a voice
 * control user saying "click Next" was reaching for a control whose name does
 * not contain the word they can see.
 */
describe('what the step buttons are called', () => {
  it('keeps the word on the button inside the name it is given', () => {
    const { getByText } = render(Pagination, { currentPage: 2, totalPages: 5 });
    expect(getByText('Back').getAttribute('aria-label')).toMatch(/^Back/);
    expect(getByText('Next').getAttribute('aria-label')).toMatch(/^Next/);
  });

  it('still says which page each one goes to', () => {
    const { getByText } = render(Pagination, { currentPage: 2, totalPages: 5 });
    expect(getByText('Back').getAttribute('aria-label')).toMatch(/before/);
    expect(getByText('Next').getAttribute('aria-label')).toMatch(/after/);
  });
});
