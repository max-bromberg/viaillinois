import { campusDate, campusTime } from '../campusTime.js';
import { locationLabel } from '../locationLabel.js';
import { DARK, LIGHT, isDark, paletteOn } from '../posterPalette.js';
import { POSTER_HEIGHT, POSTER_WIDTH, blankPoster, makeLayer } from './document.js';

/**
 * The layouts a design starts from.
 *
 * A canvas with nothing on it is the honest answer to a board asking for more
 * flexibility, and the wrong one to give somebody who has twenty minutes and a
 * meeting on Thursday. So a design begins from a template: the event already
 * laid out, in a shape somebody chose on purpose, with the organization's own
 * colour in it.
 *
 * Nothing a template lays down is fixed. A template is a stack of ordinary
 * layers and nothing else, so every piece of it can be dragged somewhere else,
 * set in another face, recoloured or taken off, and a board that wants to start
 * from nothing deletes what they do not want. That is the whole point of having
 * templates rather than a layout: they are a starting position, not a frame.
 *
 * The colours come from posterPalette.js, which a test holds against the design
 * tokens, because a canvas needs a value rather than a custom property.
 */

/** How far in from the edge a template sets its margin. */
const M = 56;

/** The date, the hours and the room, as lines a poster carries them on. */
function detailLines(event) {
  return [
    campusDate(event?.start_time, { weekday: 'long', month: 'long', day: 'numeric' }),
    event?.start_time && event?.end_time
      ? `${campusTime(event.start_time)} to ${campusTime(event.end_time)}`
      : campusTime(event?.start_time),
    event?.building || event?.location_text ? locationLabel(event) : '',
  ].filter(Boolean);
}

/** The tags of an event, as a line, or nothing where it has none. */
function tagLine(event) {
  return String(event?.tags ?? '').split(',').map(tag => tag.trim()).filter(Boolean).join('   ');
}

/** Only the layers that have something to say, so no template writes an empty line. */
function saying(layers) {
  return layers.filter(layer => (
    layer.kind !== 'text' || String(layer.text ?? '').trim() !== ''
  ));
}

/** Who is putting the event on, which is the organization's own name. */
const hostOf = (event, rso) => rso?.name ?? event?.rso_name ?? '';

/**
 * A banner across the top in the organization's colour, the title under it,
 * and the details down the left. This is the shape the designer drew before it
 * could draw anything else, kept because it is a good poster and because a
 * board that liked the old one should still be able to have it.
 */
function banner({ event, rso, accent, eventUrl }) {
  const ground = LIGHT.ground;
  const palette = paletteOn(ground);
  const onAccent = paletteOn(accent);

  return saying([
    makeLayer('shape', {
      name: 'The banner', x: 0, y: 0, width: POSTER_WIDTH, height: 185, fill: accent,
    }),
    makeLayer('text', {
      name: 'Who is putting it on',
      x: M, y: 68, width: POSTER_WIDTH - M * 2,
      text: hostOf(event, rso), fontSize: 28, weight: 700, color: onAccent.ink,
    }),
    makeLayer('shape', {
      name: 'The stripe', x: 0, y: 185, width: 6, height: POSTER_HEIGHT - 185, fill: accent,
    }),
    makeLayer('text', {
      name: 'The title',
      x: M, y: 240, width: POSTER_WIDTH - M * 2,
      text: event?.title ?? '', fontSize: 54, weight: 700, lineHeight: 1.1, color: palette.ink,
    }),
    makeLayer('text', {
      name: 'When and where',
      x: M, y: 430, width: POSTER_WIDTH - M * 2,
      text: detailLines(event).join('\n'), fontSize: 22, weight: 400,
      lineHeight: 1.7, color: palette.muted,
    }),
    makeLayer('text', {
      name: 'What it is',
      x: M, y: 580, width: POSTER_WIDTH - M * 2 - 40,
      text: event?.description ?? '', fontSize: 18, weight: 400,
      lineHeight: 1.5, color: palette.ink,
    }),
    makeLayer('text', {
      name: 'The tags',
      x: M, y: 790, width: POSTER_WIDTH - M * 2,
      text: tagLine(event), fontSize: 15, weight: 700, color: accent,
    }),
    makeLayer('shape', {
      name: 'The rule', x: M, y: 868, width: POSTER_WIDTH - M * 2, height: 1,
      shape: 'line', stroke: palette.line, strokeWidth: 1, fill: null,
    }),
    makeLayer('text', {
      name: 'Beside the square',
      x: M, y: 912, width: 360,
      text: 'Scan for details', fontSize: 16, weight: 400, color: palette.muted,
    }),
    makeLayer('qr', {
      name: 'The link square',
      x: POSTER_WIDTH - M - 160, y: 854, width: 160, height: 160,
      href: eventUrl, color: palette.ink, background: ground,
    }),
  ]);
}

/**
 * The title set as large as it will go on a dark ground, with everything else
 * small under it. This is the one that reads from the far end of a corridor.
 */
function shout({ event, rso, accent, eventUrl }) {
  const ground = DARK.ground;
  const palette = DARK;

  return saying([
    makeLayer('text', {
      name: 'Who is putting it on',
      x: M, y: 90, width: POSTER_WIDTH - M * 2,
      text: hostOf(event, rso).toUpperCase(), fontSize: 22, weight: 700,
      letterSpacing: 4, color: accent,
    }),
    makeLayer('text', {
      name: 'The title',
      x: M, y: 170, width: POSTER_WIDTH - M * 2,
      text: event?.title ?? '', fontKey: 'bebas', fontSize: 130, weight: 400,
      lineHeight: 0.92, color: palette.ink,
    }),
    makeLayer('shape', {
      name: 'The rule', x: M, y: 620, width: 180, height: 8, fill: accent,
    }),
    makeLayer('text', {
      name: 'When and where',
      x: M, y: 676, width: POSTER_WIDTH - M * 2,
      text: detailLines(event).join('\n'), fontSize: 26, weight: 700,
      lineHeight: 1.6, color: palette.ink,
    }),
    makeLayer('text', {
      name: 'What it is',
      x: M, y: 852, width: POSTER_WIDTH - M * 2 - 200,
      text: event?.description ?? '', fontSize: 17, weight: 400,
      lineHeight: 1.5, color: palette.muted,
    }),
    makeLayer('qr', {
      name: 'The link square',
      x: POSTER_WIDTH - M - 140, y: 874, width: 140, height: 140,
      href: eventUrl, color: palette.ink, background: ground,
    }),
  ]);
}

/**
 * A picture across the top two thirds with the words in a band under it. The
 * image box is empty until a board puts something in it, which is what the
 * dotted box on the canvas is for.
 */
function photograph({ event, rso, accent, eventUrl }) {
  const ground = LIGHT.ground;
  const palette = LIGHT;

  return saying([
    makeLayer('image', {
      name: 'The photograph', x: 0, y: 0, width: POSTER_WIDTH, height: 560, fit: 'cover',
    }),
    makeLayer('shape', {
      name: 'The band', x: 0, y: 560, width: POSTER_WIDTH, height: POSTER_HEIGHT - 560,
      fill: ground,
    }),
    makeLayer('shape', {
      name: 'The rule', x: 0, y: 560, width: POSTER_WIDTH, height: 10, fill: accent,
    }),
    makeLayer('text', {
      name: 'Who is putting it on',
      x: M, y: 610, width: POSTER_WIDTH - M * 2,
      text: hostOf(event, rso), fontSize: 20, weight: 700, color: accent,
    }),
    makeLayer('text', {
      name: 'The title',
      x: M, y: 650, width: POSTER_WIDTH - M * 2,
      text: event?.title ?? '', fontSize: 52, weight: 700, lineHeight: 1.08, color: palette.ink,
    }),
    makeLayer('text', {
      name: 'When and where',
      x: M, y: 800, width: POSTER_WIDTH - M * 2 - 180,
      text: detailLines(event).join('\n'), fontSize: 20, weight: 400,
      lineHeight: 1.6, color: palette.muted,
    }),
    makeLayer('qr', {
      name: 'The link square',
      x: POSTER_WIDTH - M - 130, y: 884, width: 130, height: 130,
      href: eventUrl, color: palette.ink, background: ground,
    }),
  ]);
}

/**
 * The organization's colour over the whole sheet, with the words reversed out
 * of it. A board whose colour is a pale one gets dark words on it instead,
 * because which way round that goes is a question of what reads.
 */
function saturated({ event, rso, accent, eventUrl }) {
  const palette = paletteOn(accent);
  const square = isDark(accent) ? LIGHT.ground : DARK.ground;

  return saying([
    makeLayer('text', {
      name: 'Who is putting it on',
      x: M, y: 110, width: POSTER_WIDTH - M * 2,
      text: hostOf(event, rso), fontSize: 24, weight: 700, color: palette.ink,
    }),
    makeLayer('text', {
      name: 'The title',
      x: M, y: 200, width: POSTER_WIDTH - M * 2,
      text: event?.title ?? '', fontSize: 76, weight: 700, lineHeight: 1.02, color: palette.ink,
    }),
    makeLayer('text', {
      name: 'When and where',
      x: M, y: 560, width: POSTER_WIDTH - M * 2,
      text: detailLines(event).join('\n'), fontSize: 26, weight: 400,
      lineHeight: 1.6, color: palette.ink,
    }),
    makeLayer('text', {
      name: 'What it is',
      x: M, y: 760, width: POSTER_WIDTH - M * 2 - 190,
      text: event?.description ?? '', fontSize: 18, weight: 400,
      lineHeight: 1.5, color: palette.ink,
    }),
    makeLayer('qr', {
      name: 'The link square',
      x: POSTER_WIDTH - M - 150, y: 864, width: 150, height: 150,
      href: eventUrl, color: palette.ink, background: square,
    }),
  ]);
}

/** The templates, in the order the designer offers them. */
export const TEMPLATES = [
  {
    key: 'banner',
    name: 'Banner',
    about: 'A band of the organization colour across the top, with the reading under it.',
    background: () => LIGHT.ground,
    layers: banner,
  },
  {
    key: 'shout',
    name: 'Large type',
    about: 'The title as large as it will go on a dark ground. It reads down a corridor.',
    background: () => DARK.ground,
    layers: shout,
  },
  {
    key: 'photograph',
    name: 'A photograph first',
    about: 'A picture across the top, with the words in a band under it.',
    background: () => LIGHT.ground,
    layers: photograph,
  },
  {
    key: 'saturated',
    name: 'The organization colour',
    about: 'The whole sheet in the organization colour, with the words reversed out of it.',
    background: ({ accent }) => accent,
    layers: saturated,
  },
];

/**
 * A poster document laid out from a template, filled in with the event.
 *
 * A template nobody has heard of falls back to the first one rather than to an
 * empty sheet, because an empty sheet reads as a designer that failed to load.
 */
export function posterFrom(key, context) {
  const template = TEMPLATES.find(one => one.key === key) ?? TEMPLATES[0];
  return {
    ...blankPoster(template.background(context)),
    layers: template.layers(context),
  };
}
