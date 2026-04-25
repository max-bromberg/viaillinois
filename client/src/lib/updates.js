/**
 * updates.js
 *
 * Bundles all markdown files from content/updates/ at build time via Vite's
 * import.meta.glob. Each file must have YAML frontmatter with at minimum:
 *
 *   ---
 *   title: "Post title"
 *   date: 2026-04-23
 *   summary: "One-sentence teaser shown in listings and the sidebar widget."
 *   ---
 *
 * The filename (without .md) becomes the URL slug.
 * Files are sorted newest-first by the date field.
 */

const rawFiles = import.meta.glob('../content/updates/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
});

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
    meta[key] = val;
  }
  return { meta, body: match[2].trim() };
}

/** @type {{ slug: string, title: string, date: string, summary: string, body: string }[]} */
export const allUpdates = Object.entries(rawFiles)
  .map(([path, raw]) => {
    const slug = path.split('/').pop().replace(/\.md$/, '');
    const { meta, body } = parseFrontmatter(raw);
    return {
      slug,
      title:   meta.title   ?? slug,
      date:    meta.date    ?? '',
      summary: meta.summary ?? '',
      body,
    };
  })
  .sort((a, b) => b.date.localeCompare(a.date));

/** Look up a single update by slug. Returns null if not found. */
export function getUpdate(slug) {
  return allUpdates.find(u => u.slug === slug) ?? null;
}

/** Format a YYYY-MM-DD date string for display. */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}
