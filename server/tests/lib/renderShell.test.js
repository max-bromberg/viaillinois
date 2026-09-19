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

/**
 * The shell the client builds carries a fallback sharing card, so that a page
 * the server could not describe, and the development server, still share with
 * a picture on them. The server then wrote its own card in beside it and left
 * the fallback where it was, so a document went out with two og:image tags on
 * it. Discord reads both and shows both, which is what a VIA link pasted into
 * a channel looked like: the generic card and the event's own, stacked.
 */
describe('a page whose shell already carries a sharing card', () => {
  const WITH_FALLBACK = `<!doctype html>
<html lang="en">
  <head>
    <title>VIA</title>
    <meta name="description" content="Original description." />
    <meta name="robots" content="index, follow" />
    <meta property="og:site_name" content="VIA" />
    <meta property="og:image" content="https://x.test/fallback.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="The fallback card." />
    <meta name="twitter:image" content="https://x.test/fallback.png" />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body><div id="app"></div></body>
</html>`;

  const rendered = renderShell(WITH_FALLBACK, {
    title: 'An event', description: 'What it is', canonical: 'https://x.test/events/1',
    image: 'https://x.test/og/event/1.png', imageAlt: 'The card for this event.',
  });

  const countOf = tag => (rendered.match(new RegExp(tag, 'g')) ?? []).length;

  it.each([
    'property="og:image"',
    'property="og:image:width"',
    'property="og:image:height"',
    'property="og:image:alt"',
    'name="twitter:image"',
  ])('carries exactly one %s', tag => {
    expect(countOf(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).toBe(1);
  });

  it('keeps the card the page named, not the one the shell fell back to', () => {
    expect(rendered).toContain('content="https://x.test/og/event/1.png"');
    expect(rendered).not.toContain('fallback.png');
    expect(rendered).toContain('content="The card for this event."');
  });

  /** What the shell says about itself and is not per page stays where it is. */
  it('leaves the tags that are the same on every page alone', () => {
    expect(rendered).toContain('property="og:site_name" content="VIA"');
  });

  /**
   * A page the server could not describe a card for keeps the shell's own, so
   * that a link to it still shares with a picture.
   */
  it('leaves the fallback in place for a page that names no card of its own', () => {
    const bare = renderShell(WITH_FALLBACK, { title: 'A page', description: 'Words' });
    expect(bare).toContain('content="https://x.test/fallback.png"');
    expect((bare.match(/property="og:image"/g) ?? []).length).toBe(1);
  });
});

/**
 * The summary written for crawlers, and the moment a person spends reading it.
 *
 * The server writes a plain summary of the page into the document so that a
 * crawler which does not run scripts has something to read. The application
 * took it out when it started, and a module script does not run until the
 * document has been parsed, so everybody watched a column of unstyled headings
 * and links for as long as the bundle took to arrive.
 *
 * It is taken out as the document is parsed instead, by a script sitting
 * immediately after it, which runs before the browser has anything to paint.
 * The summary is still in the bytes that were sent, which is the only place a
 * crawler that does not render looks for it.
 */
describe('the summary written for crawlers', () => {
  const rendered = renderShell(SHELL, {
    title: 'A title', description: 'A description',
    content: '<h1>What this page says</h1>',
  });

  it('is in the document that was sent', () => {
    expect(rendered).toContain('<div id="seo-content">');
    expect(rendered).toContain('<h1>What this page says</h1>');
  });

  it('is taken out by a script standing right after it, before anything is painted', () => {
    const after = rendered.slice(rendered.indexOf('</div>', rendered.indexOf('id="seo-content"')));
    const script = after.slice(0, after.indexOf('</script>') + '</script>'.length);
    expect(script).toContain('seo-content');
    expect(script).toContain('<script>');
    // Nothing deferred and nothing from the network: a module or a source
    // address would not run until the document had been parsed and painted.
    expect(script).not.toContain('type="module"');
    expect(script).not.toContain('src=');
  });

  it('comes before the application, so the application never renders under it', () => {
    expect(rendered.indexOf('id="seo-content"')).toBeLessThan(rendered.indexOf('id="app"'));
  });

  it('is nothing at all on a page the server wrote no summary for', () => {
    expect(renderShell(SHELL, { title: 'A title' })).not.toContain('seo-content');
  });
});
