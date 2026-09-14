import { toIsoWithOffset } from '../lib/timezone.js';

/**
 * The picture that stands in for a VIA link wherever it is pasted.
 *
 * The card the platform shipped with was drawn in a navy and an orange that
 * appear on no VIA surface, and it spelled the name out in whatever bold sans
 * the drawing program reached for rather than using the mark. It read as a
 * different product, and that was what anybody sharing a link passed on. It was
 * also referenced by nothing at all: no page ever set an image, so a shared
 * link had no picture on it whatsoever.
 *
 * This draws one instead, per event, so the picture carries that event's own
 * title, organization, date and room. Everything here is the drawing and
 * nothing else: no browser, no files, no network, so the part that decides what
 * a card says is checked directly. Turning the drawing into a picture is a
 * separate, thin step.
 */

/** What every reader crops a card to. */
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/** The design's own tokens, as the dark surfaces use them. */
const INK = '#e6f0f0';
const INK_2 = '#c3d3d3';
const MUTED = '#8fa8a8';
const PAPER = '#0a1516';
const DEEP = '#05090a';
const TEAL = '#2fc4c8';
const TEAL_SOFT = '#8fdfe1';
const SIGNAL = '#ff8a66';

const escape = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const dateFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'long', month: 'long', day: 'numeric',
  hour: 'numeric', minute: '2-digit',
  timeZone: 'America/Chicago',
});

function readableTime(value) {
  const iso = toIsoWithOffset(value);
  return iso ? dateFormat.format(new Date(iso)) : '';
}

function locationOf(event) {
  if (event?.building) return `${event.building} ${event.room_number ?? ''}`.trim();
  return event?.location_text || '';
}

/**
 * Break a title into the lines the card has room for.
 *
 * The card is a fixed size and a title is whatever somebody typed, so a title
 * that does not fit is broken and then stopped rather than allowed to run off
 * the edge or shrunk until nobody can read it from a link preview.
 */
function titleLines(title, { perLine = 26, maxLines = 3 } = {}) {
  const words = String(title ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > perLine && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);

  const ranOut = words.join(' ').length > lines.join(' ').length;
  if (ranOut && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.,;:]$/, '')}…`;
  }
  return lines;
}

/**
 * The mark, drawn rather than loaded, in white as it is on every dark surface.
 *
 * The paths are the ones Mark.svelte draws, so the card carries the actual mark
 * rather than an approximation of it. docs/design/03-the-look.md: white is the
 * one variation the mark takes, and a dark card is where it takes it.
 */
const MARK_PATHS = [
  'M0.012,413.969l-0.012,0l0,-413.969l61.438,0c34.367,0 62.227,27.86 62.227,62.227l-0,202.465c0,0 187.198,-187.198 246.738,-246.738c11.496,-11.496 27.087,-17.954 43.344,-17.954c0,0 61.833,-0 61.833,-0l0,56.153c1.563,17.1 -3.963,34.728 -16.579,48.092l-353.447,353.447c-24.131,24.131 -63.314,24.131 -87.444,0c-12.065,-12.065 -18.098,-27.894 -18.098,-43.722Z',
  'M1059.922,61.82l0.012,0l0,413.969l-61.438,0c-34.367,-0 -62.227,-27.86 -62.227,-62.227c0,-78.245 0,-202.465 0,-202.465c-0,-0 -187.198,187.198 -246.738,246.738c-11.496,11.496 -27.087,17.954 -43.344,17.954c-0,-0 -61.833,0 -61.833,0l-0,-56.153c-1.563,-17.1 3.963,-34.728 16.579,-48.092l353.447,-353.447c24.131,-24.131 63.314,-24.131 87.444,0c12.065,12.065 18.098,27.894 18.098,43.722Z',
  'M402.571,457.691c-24.131,24.131 -63.314,24.131 -87.444,0c-24.131,-24.131 -24.131,-63.314 0,-87.444c0,0 278.19,-278.19 352.293,-352.293c11.496,-11.496 27.087,-17.954 43.344,-17.954c0,0 61.833,-0 61.833,-0l0,56.153c1.563,17.1 -3.963,34.728 -16.579,48.092l-353.447,353.447Z',
];

/** The mark at a given height, drawn from its own 1060 by 476 box. */
function mark(x, y, height) {
  const scale = height / 476;
  return `<g class="mark" transform="translate(${x} ${y}) scale(${scale})" fill="#ffffff">`
    + MARK_PATHS.map(path => `<path d="${path}"/>`).join('')
    + '</g>';
}

/** What the card says when it is not about one event. */
const SHARED_SENTENCE = 'Every event from Illinois ECE student organizations, in one place.';

/**
 * The detail line, stopped at the width the card has.
 *
 * The line is set in a mono face, where every character is 0.6 of the size, so
 * a character count is a width. The card is 1200 wide with a 72 margin each
 * side, which at 24px leaves room for 73 characters, and the limit is one under
 * that. A building somebody named at length would otherwise run straight off
 * the picture, and the ordinary case, a weekday, a date, a time and a building
 * with a room, is 66.
 */
export const DETAIL_LIMIT = 72;

function fit(text, limit = DETAIL_LIMIT) {
  const value = String(text ?? '');
  return value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
}

/** What a reader is told the picture shows. */
export function cardAlt(event = null) {
  if (!event?.title) {
    return 'VIA: every event from Electrical and Computer Engineering student organizations at Illinois, in one place.';
  }
  const who = event.rso_name ? ` by ${event.rso_name}` : '';
  const when = readableTime(event.start_time);
  return `${event.title}${who}${when ? `, ${when}` : ''}. Shared from VIA.`;
}

/**
 * The card, as a drawing.
 *
 * @param {object|null} event The event this card is for, or nothing for the
 *   card every other page shares.
 */
export function cardSvg(event = null) {
  const cancelled = Boolean(event?.cancelled_at);
  const lines = titleLines(event?.title);
  const hasEvent = lines.length > 0;

  // The block is set from its last line upwards, so one line and three lines
  // both sit on the same baseline above the detail rather than drifting.
  const lastLine = 396;
  const heading = hasEvent
    ? lines.map((line, at) => {
        const y = lastLine - (lines.length - 1 - at) * 74;
        return `<text class="title" x="72" y="${y}">${escape(line)}</text>`;
      }).join('')
    : titleLines(SHARED_SENTENCE).map((line, at, all) =>
        `<text class="title" x="72" y="${lastLine - (all.length - 1 - at) * 74}">${escape(line)}</text>`,
      ).join('');

  const when = hasEvent ? readableTime(event.start_time) : '';
  const where = hasEvent ? locationOf(event) : '';

  const org = hasEvent && event.rso_name
    ? `<circle cx="78" cy="${lastLine - lines.length * 74 - 22}" r="7" fill="${TEAL}"/>`
      + `<text class="org" x="98" y="${lastLine - lines.length * 74 - 15}">${escape(event.rso_name)}</text>`
    : '';

  const flag = cancelled
    ? `<rect x="72" y="92" width="152" height="36" fill="${SIGNAL}"/>`
      + '<text class="flag" x="87" y="117">Cancelled</text>'
    : '';

  const detail = [when, where].filter(Boolean).join('  ·  ');
  const footer = hasEvent
    ? `<text class="detail" x="72" y="474">${escape(fit(detail))}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" `
    + `viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" role="img" aria-label="${escape(cardAlt(event))}">`
    + '<defs>'
    + `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0%" stop-color="${DEEP}"/><stop offset="55%" stop-color="${PAPER}"/>`
    + `<stop offset="100%" stop-color="#0f2224"/></linearGradient>`
    + '</defs>'
    + `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#sky)"/>`
    // The chamfer the whole design takes, at the corner it always takes it.
    + `<path d="M${CARD_WIDTH - 96} 0 L${CARD_WIDTH} 0 L${CARD_WIDTH} 96 Z" fill="${PAPER}"/>`
    + `<rect x="0" y="${CARD_HEIGHT - 6}" width="${CARD_WIDTH}" height="6" fill="${TEAL}"/>`
    + flag
    + org
    + heading
    + footer
    + `<rect x="72" y="${CARD_HEIGHT - 132}" width="${CARD_WIDTH - 144}" height="1" fill="#0f2224"/>`
    + mark(72, CARD_HEIGHT - 96, 38)
    + `<text class="domain" x="172" y="${CARD_HEIGHT - 63}">viaillinois.com</text>`
    + '<style>'
    + `.title{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:800;font-size:62px;fill:${INK};letter-spacing:-1.2px}`
    + `.org{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:700;font-size:26px;fill:${TEAL_SOFT};letter-spacing:.4px}`
    + `.flag{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:800;font-size:20px;fill:${DEEP}}`
    + `.detail{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:24px;fill:${INK_2}}`
    + `.domain{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:24px;fill:${MUTED}}`
    + '</style>'
    + '</svg>';
}
