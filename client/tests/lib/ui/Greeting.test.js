import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { Greeting } from '../../../src/lib/components/ui/Greeting/index.js';

/**
 * Every arrival gets a sentence written for the moment. Signed in it uses the
 * person's first name and counts only the organizations they follow; signed out
 * it greets Illinois. The counts are numerals with their meaning in words beside
 * them, and only the one about tonight is orange.
 */
describe('Greeting', () => {
  it('greets by the hour', () => {
    for (const [hour, said] of [[8, 'Good morning,'], [14, 'Good afternoon,'], [20, 'Good evening,']]) {
      const { container } = render(Greeting, { hour });
      expect(container.querySelector('h2').textContent).toContain(said);
    }
  });

  it('greets Illinois when nobody is signed in', () => {
    const { container } = render(Greeting, { hour: 20 });
    expect(container.querySelector('h2 b').textContent).toBe('Illinois.');
  });

  it('greets a person by their first name when they are signed in', () => {
    const { container } = render(Greeting, { hour: 20, name: 'Max' });
    expect(container.querySelector('h2 b').textContent).toBe('Max.');
  });

  it('sets tonight in orange, and nothing else on the line', () => {
    const { container } = render(Greeting, {
      hour: 20,
      tonight: 2,
      where: 'ECEB',
      week: 12,
      midterm: { days: 9, course: 'ECE 210' },
    });
    const hot = container.querySelectorAll('.hot');
    expect(hot.length).toBe(1);
    expect(hot[0].textContent).toBe('2');
  });

  it('says each count and its meaning in one phrase', () => {
    const { container } = render(Greeting, {
      hour: 20,
      tonight: 2,
      where: 'ECEB',
      week: 12,
      midterm: { days: 9, course: 'ECE 210' },
    });
    const line = container.querySelector('.line').textContent;
    expect(line).toContain('2tonight in ECEB');
    expect(line).toContain('12this week');
    expect(line).toContain('9days to the ECE 210 midterm');
  });

  it('puts no number in a tile, and draws no box around one', () => {
    const { container } = render(Greeting, { hour: 20, tonight: 2, where: 'ECEB', week: 12 });
    for (const node of container.querySelectorAll('*')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(/border|background/);
    }
  });

  it('leaves out a count it has not been given rather than showing a zero it invented', () => {
    const { container } = render(Greeting, { hour: 20, week: 12 });
    const line = container.querySelector('.line').textContent;
    expect(line).toContain('12this week');
    expect(line).not.toContain('tonight');
    expect(line).not.toContain('midterm');
  });

  /**
   * docs/design/09-accessibility.md: the greeting is a live region that announces
   * once when the counts arrive, rather than reading the whole band again.
   */
  it('announces its counts once, politely', () => {
    const { container } = render(Greeting, { hour: 20, week: 12 });
    const line = container.querySelector('.line');
    expect(line.getAttribute('aria-live')).toBe('polite');
    expect(line.getAttribute('aria-atomic')).toBe('true');
  });

  it('greets in a second level heading, because the greeting is not the page title', () => {
    const { container } = render(Greeting, { hour: 20 });
    expect(container.querySelector('h2')).toBeTruthy();
    expect(container.querySelector('h1')).toBe(null);
  });

  /**
   * A page title is the page's own first level heading and it happens to be set
   * in the band, so it is an h1. The greeting is not a heading of that kind: it
   * names the reader, and the agenda under it carries the page's structure.
   */
  it('sets a title in place of the greeting on a page that is not the feed', () => {
    const { container } = render(Greeting, { hour: 20, title: 'Midterms, Fall 2026' });
    expect(container.querySelector('h1').textContent).toBe('Midterms, Fall 2026');
    expect(container.querySelector('h2')).toBe(null);
    expect(container.textContent).not.toContain('Good evening');
  });
});
