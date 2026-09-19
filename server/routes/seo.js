import { Router } from 'express';
import { getPublicEventSitemapEntries } from '../db/queries/events.js';
import { getPublicOrganizations } from '../db/queries/rso.js';
import { escapeHtml } from '../lib/seo/render.js';
import { toIsoWithOffset } from '../lib/timezone.js';
import { publicFor } from '../middleware/caching.js';

/**
 * The files search engines and assistants fetch before anything else.
 *
 * All three were previously static files in the client bundle, and two of them
 * were wrong in the same way: the sitemap protocol requires absolute
 * addresses, and both the sitemap entries and the robots.txt reference to it
 * were relative, so every entry was rejected. Generating them here also means
 * the sitemap lists the events that actually exist rather than four fixed
 * pages.
 */

const router = Router();

/**
 * What crawlers read is the same for every one of them and they come back
 * often, so the edge can answer without asking Champaign. On the routes rather
 * than on the mount, because this router is mounted for every path and the
 * pages it does not answer are not this cacheable.
 */
const crawlerCache = publicFor({ browserSeconds: 300, edgeSeconds: 900 });

/** Pages that always exist, with how often they are worth revisiting. */
const FIXED_PAGES = [
  { path: '/',              changefreq: 'daily',   priority: '1.0' },
  { path: '/calendar',      changefreq: 'daily',   priority: '0.9' },
  { path: '/organizations', changefreq: 'weekly',  priority: '0.9' },
  { path: '/midterms',      changefreq: 'weekly',  priority: '0.8' },
  { path: '/updates',       changefreq: 'weekly',  priority: '0.5' },
  { path: '/about',         changefreq: 'monthly', priority: '0.6' },
  { path: '/privacy',       changefreq: 'yearly',  priority: '0.2' },
  { path: '/terms',         changefreq: 'yearly',  priority: '0.2' },
];

/**
 * One entry, with a lastmod only where VIA actually knows when the page
 * changed.
 *
 * Google reads lastmod as a crawl signal where it is consistently accurate and
 * ignores it everywhere once it is not, so a date guessed at costs more than a
 * date left out. The event entries used to publish the hour the event starts
 * at, which for anything still to come is a claim to have been modified in the
 * future.
 */
function urlEntry({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${escapeHtml(loc)}</loc>`,
    ...(lastmod ? [`    <lastmod>${escapeHtml(lastmod)}</lastmod>`] : []),
    ...(changefreq ? [`    <changefreq>${changefreq}</changefreq>`] : []),
    ...(priority ? [`    <priority>${priority}</priority>`] : []),
    '  </url>',
  ].join('\n');
}

/** Read a list the sitemap would like, answering with none of it rather than failing. */
async function listedOrNothing(read) {
  try {
    return await read();
  } catch {
    // The rest of the sitemap is still worth submitting, so one table being
    // away degrades what is listed rather than removing the file.
    return [];
  }
}

/** The address the site is actually being served on. */
export function originOf(req) {
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

router.get('/sitemap.xml', crawlerCache, async (req, res, next) => {
  try {
    const site = originOf(req);

    const [events, organizations] = await Promise.all([
      listedOrNothing(getPublicEventSitemapEntries),
      listedOrNothing(getPublicOrganizations),
    ]);

    const entries = [
      ...FIXED_PAGES.map(page => urlEntry({
        loc: site + page.path,
        changefreq: page.changefreq,
        priority: page.priority,
      })),
      // The organizations come before the events, because a crawler working
      // down a sitemap reaches the pages that link to every event first.
      ...organizations.map(rso => urlEntry({
        loc: `${site}/organizations/${rso.rso_id}`,
        lastmod: toIsoWithOffset(rso.last_change),
        changefreq: 'weekly',
        priority: '0.8',
      })),
      ...events.map(event => urlEntry({
        loc: `${site}/events/${event.event_id}`,
        lastmod: toIsoWithOffset(event.updated_at),
        changefreq: 'weekly',
        priority: '0.7',
      })),
    ];

    res.type('application/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + entries.join('\n')
      + '\n</urlset>\n'
    );
  } catch (err) { next(err); }
});

router.get('/robots.txt', crawlerCache, (req, res) => {
  const site = originOf(req);
  res.type('text/plain').send(
`User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /admin
Disallow: /login
Disallow: /scheduler
Disallow: /poster
Disallow: /api/

# Assistants send their own crawlers, and the point of this site is that people
# find these events. They are welcome, and named here because several of them
# only index a site that says so explicitly.
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: CCBot
Allow: /

Sitemap: ${site}/sitemap.xml
`);
});

/**
 * A plain description of the site for assistants, following the llms.txt
 * convention: what this is, who it serves, and where the machine readable
 * parts live.
 */
router.get('/llms.txt', crawlerCache, (req, res) => {
  const site = originOf(req);
  res.type('text/plain').send(
`# VIA (Virtually Integrated Agenda)

> VIA is the shared events platform for registered student organizations in the
> Electrical and Computer Engineering department at the University of Illinois
> Urbana-Champaign. It lists what those organizations are running, when and
> where, along with the department's shared midterm and evening exam schedule.

VIA answers questions such as: what ECE events are happening at Illinois this
week, when is the next IEEE or HKN meeting, where is a given student
organization meeting, and when are the ECE midterms.

## Pages

- [Event feed](${site}/): every upcoming public event, newest first
- [Calendar](${site}/calendar): the same events, month by month
- [Student organizations](${site}/organizations): every ECE student organization
  publishing on VIA, each with a page of its own at /organizations/{id} carrying
  what it is and the events it has coming up
- [Midterm schedule](${site}/midterms): ECE midterm and evening exam dates
- [About](${site}/about): what VIA is and who runs it

## Machine readable

- [Sitemap](${site}/sitemap.xml): every public page, including one per event
- Every event page carries schema.org Event data as JSON-LD, including start
  and end times with the campus timezone offset, the organizing student
  organization and a link to its page, the room or online location, and the
  fact that every event is free to attend.
- Every organization page carries schema.org Organization data and a list of
  that organization's events.
- Events are in America/Chicago. Times published as JSON-LD carry an explicit
  offset; times shown on the page are local to campus.

## Notes

- Events marked internal to an organization are not published and are excluded
  from the sitemap and from search indexing.
- The midterm schedule is sourced from HKN and is confirmed rather than
  crowdsourced.
`);
});

export default router;
