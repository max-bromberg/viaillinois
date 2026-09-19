import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import ReadingPage from '../../src/lib/ReadingPage.svelte';

const body = () => createRawSnippet(() => ({ render: () => '<p>What this page says.</p>' }));

/**
 * About, the updates, the terms and the privacy policy are reading pages: the
 * page title in the condensed display face at 56 px, then prose in Plex Sans at
 * a 62 character measure with headings at 30 px. See
 * docs/design/08-surfaces.md and docs/design/05-typography.md.
 */
describe('a reading page', () => {
  it('sets the page title as the one first level heading', () => {
    const { getByRole } = render(ReadingPage, { title: 'Terms of Use', children: body() });
    expect(getByRole('heading', { name: 'Terms of Use', level: 1 })).toBeTruthy();
  });

  it('reads what is put inside it', () => {
    const { container } = render(ReadingPage, { title: 'About VIA', children: body() });
    expect(container.textContent).toContain('What this page says.');
  });

  it('sets a dateline in mono, where the page has one', () => {
    const { container } = render(ReadingPage, {
      title: 'Terms of Use',
      dateline: 'Effective September 1, 2026.',
      children: body(),
    });
    const dateline = container.querySelector('.dateline');
    expect(dateline.classList.contains('mono')).toBe(true);
    expect(dateline.textContent).toBe('Effective September 1, 2026.');
  });

  it('has no dateline where the page was given none', () => {
    const { container } = render(ReadingPage, { title: 'About VIA', children: body() });
    expect(container.querySelector('.dateline')).toBe(null);
  });

  /**
   * The measure and the two type sizes are the whole of what makes a reading
   * page, so they are held here rather than left to be read off a screenshot.
   */
  it('holds the reading measure and the two sizes the design document sets', () => {
    const source = readFileSync('src/lib/ReadingPage.svelte', 'utf8');
    expect(source).toMatch(/max-width:\s*62ch/);
    expect(source).toMatch(/font-size:\s*56px/);
    expect(source).toMatch(/font-size:\s*30px/);
  });
});

/**
 * A reading page sets prose links in the primary colour and underlines them,
 * which is right for a link inside a sentence and wrong for a button. The
 * "Continue to Discord" button on the linking page is an anchor, so the prose
 * rule outranked the button's own colour and painted the label in the primary
 * colour on the primary gradient, which left it unreadable.
 */
describe('a button standing inside a reading page', () => {
  const source = readFileSync('src/lib/ReadingPage.svelte', 'utf8');

  /** The selector of the rule that colours prose links. */
  const linkRule = /\.reading :global\((a.*?)\)\s*\{[^}]*color:\s*var\(--primary\)/.exec(source);

  it('is left out of the rule that colours prose links', () => {
    expect(linkRule, 'expected a rule colouring prose links').not.toBeNull();
    expect(linkRule[1]).toContain(':not(.btn)');
  });

  it('keeps the colour its variant gives it', () => {
    const { container } = render(ReadingPage, {
      title: 'Link your Discord account',
      children: createRawSnippet(() => ({
        render: () => '<a class="btn primary cut" href="/auth/discord/start">Continue to Discord</a>',
      })),
    });
    const button = container.querySelector('a.btn');
    expect(button.matches('.reading :is(a:not(.btn))')).toBe(false);
  });
});
