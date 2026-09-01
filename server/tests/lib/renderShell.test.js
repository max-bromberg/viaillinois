import { describe, it, expect } from 'vitest';
import { renderShell, escapeHtml } from '../../lib/seo/render.js';

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <title>VIA: Virtually Integrated Agenda</title>
    <meta name="description" content="Original description." />
    <meta name="robots" content="index, follow" />
    <meta name="twitter:card" content="summary" />
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`;

const render = options => renderShell(SHELL, {
  title: 'A title', description: 'A description', canonical: 'https://x.test/p', ...options,
});

describe('renderShell', () => {
  it('replaces the title so every page is not called the same thing', () => {
    expect(render({})).toContain('<title>A title</title>');
    expect(render({})).not.toContain('VIA: Virtually Integrated Agenda</title>');
  });

  it('replaces the description rather than adding a second one', () => {
    const html = render({});
    expect(html).toContain('content="A description"');
    expect(html.match(/<meta name="description"/g)).toHaveLength(1);
  });

  it('states the canonical address, so one page is not indexed under many URLs', () => {
    expect(render({})).toContain('<link rel="canonical" href="https://x.test/p"');
  });

  it('gives sharing cards an absolute image and address', () => {
    const html = render({ image: 'https://x.test/card.png' });
    expect(html).toContain('property="og:url" content="https://x.test/p"');
    expect(html).toContain('property="og:image" content="https://x.test/card.png"');
    expect(html).toContain('name="twitter:image" content="https://x.test/card.png"');
  });

  /**
   * A card with an image gets a large preview, which is the difference between
   * a link that gets clicked in a group chat and one that does not. The size
   * and the alternative text are both read by the platforms that render it.
   */
  it('describes the sharing image fully', () => {
    const html = render({ image: 'https://x.test/card.png' });
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
    expect(html).toContain('property="og:image:alt"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });

  it('keeps a page out of the index when told to', () => {
    expect(render({ robots: 'noindex, nofollow' })).toContain('content="noindex, nofollow"');
    expect(render({ robots: 'noindex, nofollow' })).not.toContain('content="index, follow"');
  });

  it('embeds structured data as a script a crawler can read', () => {
    const html = render({ jsonLd: [{ '@type': 'Event', name: 'Thing' }] });
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('"@type":"Event"');
  });

  /**
   * Event titles are written by RSO admins and imported from calendar files.
   * Anything from those sources reaches this HTML, so it has to be escaped
   * before it gets there.
   */
  it('escapes text before putting it in the page', () => {
    const html = render({ title: '</title><script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes a quote so it cannot break out of an attribute', () => {
    expect(render({ description: 'He said "no" & left' })).toContain('&quot;no&quot; &amp; left');
  });

  /** A closing tag inside JSON would end the script element early. */
  it('escapes structured data so it cannot close its own script tag', () => {
    const html = render({ jsonLd: [{ name: '</script><script>alert(1)</script>' }] });
    expect(html).not.toMatch(/<\/script><script>alert/);
    expect(html).toContain('\\u003c');
  });

  it('puts readable content in the body for anything that does not run scripts', () => {
    const html = render({ content: '<h1>Readable</h1>' });
    expect(html).toContain('<h1>Readable</h1>');
    expect(html.indexOf('<h1>Readable</h1>')).toBeGreaterThan(html.indexOf('<body>'));
  });

  it('leaves the shell alone when there is nothing to say about a route', () => {
    expect(renderShell(SHELL, {})).toContain('<title>VIA: Virtually Integrated Agenda</title>');
  });
});

describe('escapeHtml', () => {
  it('escapes the five characters that matter', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('treats nothing as an empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});
