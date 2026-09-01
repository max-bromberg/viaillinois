/**
 * Per page metadata written into the HTML shell before it is served.
 *
 * VIA is a single page application: the server sends one empty document for
 * every address and the browser builds the page. A crawler that runs
 * JavaScript may eventually see the result, but it is queued and unreliable,
 * and the crawlers behind most assistants do not run it at all. So every page
 * looked identical to them, titled the same and containing nothing.
 *
 * This puts the title, the description, the canonical address, the sharing
 * tags, the structured data and a readable summary into the document itself.
 * The application replaces the summary when it starts, so what a crawler reads
 * and what a person sees are the same thing.
 */

const ESCAPES = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };

/**
 * Escape text for HTML. Event titles, descriptions and locations are written
 * by RSO admins and imported from calendar files, so all of it is untrusted by
 * the time it reaches this document.
 */
export function escapeHtml(text) {
  return String(text ?? '').replace(/[<>&"']/g, character => ESCAPES[character]);
}

/**
 * Serialise structured data for embedding.
 *
 * The angle bracket has to go, or a closing script tag inside any string value
 * would end the element early and everything after it would be parsed as HTML.
 */
function serialiseJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function replaceTag(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

/**
 * @param {string} shell the built index.html
 * @param {{
 *   title?: string, description?: string, canonical?: string, robots?: string,
 *   image?: string, jsonLd?: object[], content?: string, type?: string,
 * }} page
 */
export function renderShell(shell, page) {
  let html = shell;

  if (page.title) {
    html = replaceTag(html, /<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`);
  }

  if (page.description) {
    html = replaceTag(
      html,
      /<meta name="description" content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escapeHtml(page.description)}" />`
    );
  }

  if (page.robots) {
    html = replaceTag(
      html,
      /<meta name="robots" content="[^"]*"\s*\/?>/,
      `<meta name="robots" content="${escapeHtml(page.robots)}" />`
    );
  }

  const head = [];

  if (page.canonical) {
    head.push(`<link rel="canonical" href="${escapeHtml(page.canonical)}" />`);
    head.push(`<meta property="og:url" content="${escapeHtml(page.canonical)}" />`);
  }
  if (page.title) {
    head.push(`<meta property="og:title" content="${escapeHtml(page.title)}" />`);
    head.push(`<meta name="twitter:title" content="${escapeHtml(page.title)}" />`);
  }
  if (page.description) {
    head.push(`<meta property="og:description" content="${escapeHtml(page.description)}" />`);
    head.push(`<meta name="twitter:description" content="${escapeHtml(page.description)}" />`);
  }
  if (page.image) {
    head.push(`<meta property="og:image" content="${escapeHtml(page.image)}" />`);
    head.push('<meta property="og:image:width" content="1200" />');
    head.push('<meta property="og:image:height" content="630" />');
    head.push(`<meta property="og:image:alt" content="${escapeHtml(page.imageAlt ?? 'VIA: every event from ECE student organizations at Illinois, in one place.')}" />`);
    head.push(`<meta name="twitter:image" content="${escapeHtml(page.image)}" />`);
    // A card with an image is shown large, which is what gets it clicked.
    html = replaceTag(
      html,
      /<meta name="twitter:card" content="[^"]*"\s*\/?>/,
      '<meta name="twitter:card" content="summary_large_image" />'
    );
  }
  if (page.type) {
    head.push(`<meta property="og:type" content="${escapeHtml(page.type)}" />`);
  }
  for (const item of page.jsonLd ?? []) {
    head.push(`<script type="application/ld+json">${serialiseJsonLd(item)}</script>`);
  }

  if (head.length) {
    html = html.replace('</head>', `    ${head.join('\n    ')}\n  </head>`);
  }

  if (page.content) {
    // Outside the application's mount point, and removed by the application on
    // startup, so the two never both appear.
    html = html.replace('<body>', `<body>\n    <div id="seo-content">${page.content}</div>`);
  }

  return html;
}
