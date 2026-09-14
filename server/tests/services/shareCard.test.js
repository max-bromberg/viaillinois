import { describe, it, expect } from 'vitest';
import { cardSvg, cardAlt, CARD_WIDTH, CARD_HEIGHT, DETAIL_LIMIT } from '../../services/shareCard.js';

/**
 * The picture that stands in for a VIA link wherever it is pasted.
 *
 * The one the platform shipped with was drawn in a navy and an orange that
 * appear nowhere in the design, and it spelled the name out in whatever bold
 * sans the drawing program defaulted to rather than using the mark. It looked
 * like a different product, which is what somebody sharing a link was passing
 * on. It was also referenced by nothing at all, so in practice a shared link
 * had no picture on it whatsoever.
 *
 * The card is generated rather than drawn once, so the picture for an event
 * carries that event's own title, date and organization. The generator makes
 * the drawing and nothing else, so all of this is checked without a browser.
 */
const EVENT = {
  event_id: 42,
  title: 'Resume Review Night',
  rso_name: 'IEEE',
  start_time: '2026-09-20 18:00:00',
  end_time: '2026-09-20 20:00:00',
  building: 'Electrical & Computer Eng Bldg',
  room_number: '1002',
};

describe('the shape of the card', () => {
  it('is the size every reader crops to', () => {
    expect(CARD_WIDTH).toBe(1200);
    expect(CARD_HEIGHT).toBe(630);
    const svg = cardSvg();
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
  });

  it('is a drawing rather than a photograph of one', () => {
    expect(cardSvg()).toMatch(/^<svg\b/);
  });
});

describe('the card for one event', () => {
  it('carries the event, who is running it, when and where', () => {
    const svg = cardSvg(EVENT);
    expect(svg).toContain('Resume Review Night');
    expect(svg).toContain('IEEE');
    expect(svg).toMatch(/September 20|Sep 20/);
    expect(svg).toContain('1002');
  });

  it('escapes a title that would otherwise close the drawing', () => {
    const svg = cardSvg({ ...EVENT, title: 'Q&A with <script>alert(1)</script>' });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&amp;');
  });

  it('breaks a long title over lines rather than running it off the edge', () => {
    const svg = cardSvg({
      ...EVENT,
      title: 'A Very Long Evening About Designing Low Power Memory Interfaces For Everybody',
    });
    const lines = [...svg.matchAll(/class="title"/g)];
    expect(lines.length).toBeGreaterThan(1);
  });

  it('stops rather than running a title past what the card can hold', () => {
    const svg = cardSvg({ ...EVENT, title: 'word '.repeat(120) });
    expect([...svg.matchAll(/class="title"/g)].length).toBeLessThanOrEqual(3);
    expect(svg).toContain('…');
  });

  it('says a cancelled event was cancelled, because that is the news', () => {
    const svg = cardSvg({ ...EVENT, cancelled_at: '2026-09-15 09:00:00' });
    expect(svg).toMatch(/Cancelled/);
  });
});

describe('the card with no event, which every other page shares', () => {
  it('says what the platform is without naming a building', () => {
    const svg = cardSvg();
    expect(svg).toContain('viaillinois.com');
    expect(svg).not.toContain('ECEB');
    expect(svg).not.toMatch(/lobby/i);
  });
});

describe('the colours it is drawn in', () => {
  /**
   * The whole complaint about the old card. Every colour on this one is a
   * token from the design, so a card and the site it links to are recognisably
   * the same thing.
   */
  it('uses the design\'s own palette and nothing else', () => {
    const svg = cardSvg(EVENT);
    const used = new Set([...svg.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(m => m[0].toLowerCase()));
    const palette = new Set([
      '#0a1516', '#111f20', '#0f2224', '#e6f0f0', '#c3d3d3', '#8fa8a8',
      '#2fc4c8', '#00aaaf', '#8fdfe1', '#ff8a66', '#ffffff', '#05090a',
    ]);
    expect([...used].filter(colour => !palette.has(colour))).toEqual([]);
  });

  it('carries no colour from the platform it was drawn to replace', () => {
    const svg = cardSvg(EVENT).toLowerCase();
    // The navy and the orange of the old card, which belong to no VIA surface.
    expect(svg).not.toContain('#0f172a');
    expect(svg).not.toContain('#f04e23');
    expect(svg).not.toContain('#13294b');
  });

  it('draws the mark rather than setting the name in whatever face is to hand', () => {
    expect(cardSvg()).toContain('class="mark"');
  });
});

describe('what a reader is told the picture shows', () => {
  it('describes the event when there is one', () => {
    expect(cardAlt(EVENT)).toContain('Resume Review Night');
    expect(cardAlt(EVENT)).toContain('IEEE');
  });

  it('describes the platform when there is not', () => {
    expect(cardAlt()).toMatch(/VIA/);
    expect(cardAlt()).not.toContain('undefined');
  });
});

/**
 * Found by rendering the card and looking at it. The sentence on the card
 * every non-event page shares was written as two hand measured lines, and the
 * second one ran off the right edge of the picture. The detail line under an
 * event was one long location away from doing the same.
 *
 * Nothing on a fixed size card is allowed to be hand measured, because the text
 * is whatever an organizer typed and the card cannot grow.
 */
const textsOf = (svg, className) =>
  [...svg.matchAll(new RegExp(`class="${className}"[^>]*>([^<]*)<`, 'g'))].map(m => m[1]);

describe('nothing runs off the edge', () => {
  it('wraps the sentence on the shared card to the width it has', () => {
    for (const line of textsOf(cardSvg(), 'title')) {
      expect(line.length, `"${line}" is too long for the card`).toBeLessThanOrEqual(28);
    }
  });

  it('wraps an event title to the same width', () => {
    const svg = cardSvg({ ...EVENT, title: 'Industry Talk: Designing Low Power Memory Interfaces for Everybody' });
    for (const line of textsOf(svg, 'title')) {
      expect(line.length, `"${line}" is too long for the card`).toBeLessThanOrEqual(28);
    }
  });

  it('stops the detail line rather than letting a long room run past the edge', () => {
    const svg = cardSvg({
      ...EVENT,
      building: 'The Extremely Long Named Campus Instructional And Research Facility',
      room_number: '3039A',
    });
    const [detail] = textsOf(svg, 'detail');
    expect(detail.length).toBeLessThanOrEqual(DETAIL_LIMIT);
    expect(detail).toContain('…');
  });

  it('leaves a detail line that already fits alone', () => {
    const [detail] = textsOf(cardSvg(EVENT), 'detail');
    expect(detail).not.toContain('…');
  });
});
