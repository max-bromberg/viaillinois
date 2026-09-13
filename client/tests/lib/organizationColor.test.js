import { describe, it, expect } from 'vitest';
import { organizationColor, organizationColors } from '../../src/lib/organizationColor.js';
import { contrast, mix } from '../support/color.js';

/**
 * An organization's colour, bent into VIA's range.
 *
 * docs/design/04-color.md decides that organization colours are adapted rather than
 * clamped at entry or dropped, and it pays for that decision with a promise:
 * every input, including the ones nobody should choose, comes out readable. The
 * promise is kept here rather than by hoping nobody picks neon yellow.
 */

/** The worked examples in docs/design/04-color.md, in the light theme. */
const WORKED = [
  ['IEEE', '#00629B', '#297ab5', '#015181'],
  ['HKN', '#8B1E3F', '#b84964', '#871f3e'],
  ['WECE', '#7C3AED', '#7a5dc8', '#523891'],
  ['Illini Solar Car', '#F59E0B', '#a06604', '#6c4302'],
  ['ECE Ambassadors', '#059669', '#0e8961', '#085c3f'],
];

/**
 * The inputs the colour document says were tested, which are the ones that make
 * the adaptation work: the two ends of the lightness range, a gray with no hue
 * to keep, and four colours that are far outside anything the site would choose.
 */
const HARD = {
  'pure black': '#000000',
  'pure white': '#ffffff',
  'mid gray': '#808080',
  'neon yellow': '#ffff00',
  lime: '#00ff00',
  navy: '#001f5c',
  cyan: '#00ffff',
};

const SURFACE = { light: { card: '#ffffff', paper: '#f5fafa' }, dark: { card: '#111f20', paper: '#0a1516' } };
const LAMP_AT_REST = { light: 14, dark: 22 };

describe('the worked examples', () => {
  it.each(WORKED)('adapts %s exactly as the colour document records it', (name, given, mark, text) => {
    expect(organizationColor(given, 'mark', 'light')).toBe(mark);
    expect(organizationColor(given, 'text', 'light')).toBe(text);
  });
});

describe('the adaptation', () => {
  it('is a pure function of the colour, the role and the theme', () => {
    expect(organizationColor('#00629B', 'lamp', 'dark')).toBe(organizationColor('#00629B', 'lamp', 'dark'));
    expect(organizationColor('#00629B', 'lamp', 'dark')).not.toBe(organizationColor('#00629B', 'lamp', 'light'));
  });

  it('reads a colour with or without its hash, in either case, at three digits or six', () => {
    expect(organizationColor('00629B', 'mark', 'light')).toBe('#297ab5');
    expect(organizationColor('#00629b', 'mark', 'light')).toBe('#297ab5');
    expect(organizationColor('#f00', 'mark', 'light')).toBe(organizationColor('#ff0000', 'mark', 'light'));
  });

  it('falls back to the muted grey when an organization has chosen nothing', () => {
    for (const nothing of [null, undefined, '', 'not a colour', '#12345']) {
      expect(organizationColor(nothing, 'mark', 'light')).toBe('#4d6667');
      expect(organizationColor(nothing, 'mark', 'dark')).toBe('#8fa8a8');
    }
  });

  it('refuses a role it does not have', () => {
    expect(() => organizationColor('#00629B', 'border', 'light')).toThrow();
  });

  it.each(['light', 'dark'])('keeps a grey grey in the %s theme', theme => {
    for (const grey of ['#000000', '#ffffff', '#808080', '#3a3a3a']) {
      const [r, g, b] = [1, 3, 5].map(at => parseInt(organizationColor(grey, 'mark', theme).slice(at, at + 2), 16));
      // A grey has no hue to keep, so the three channels stay within rounding of
      // each other rather than being given a colour the organization never chose.
      expect(Math.max(r, g, b) - Math.min(r, g, b), `${grey} came back coloured`).toBeLessThanOrEqual(2);
    }
  });

  it.each(['light', 'dark'])('lands every role at the lightness its role asks for, in the %s theme', theme => {
    // Every organization's mark sits at one lightness, so no organization shouts
    // over another. Checked as relative luminance order rather than as OKLCH,
    // since that is what a reader actually sees.
    const marks = Object.values(HARD).map(given => organizationColor(given, 'mark', theme));
    const ratios = marks.map(mark => contrast(mark, '#ffffff'));
    expect(Math.max(...ratios) / Math.min(...ratios)).toBeLessThan(2);
  });
});

describe.each(['light', 'dark'])('in the %s theme, every input tested', theme => {
  const surfaces = SURFACE[theme];
  const strength = LAMP_AT_REST[theme];

  /**
   * The name sits on its own lamp, which is the adapted lamp colour mixed into
   * the row at the strength in the colour document. That is the background the
   * name is hardest to read on, so it is the one measured.
   */
  it.each(Object.entries(HARD))('reads the name of an organization whose colour is %s on its own lamp', (_, given) => {
    const { text, lamp } = organizationColors(given, theme);
    const lit = mix(lamp, strength, surfaces.card);
    expect(contrast(text, lit)).toBeGreaterThanOrEqual(6);
  });

  it.each(Object.entries(HARD))('reads the name of an organization whose colour is %s on paper', (_, given) => {
    expect(contrast(organizationColor(given, 'text', theme), surfaces.paper)).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * The mark is a 12 px shape that is always beside the name, so it is held to
   * the threshold for graphics rather than for text.
   */
  it.each(Object.entries(HARD))('shows the mark of an organization whose colour is %s on paper', (_, given) => {
    expect(contrast(organizationColor(given, 'mark', theme), surfaces.paper)).toBeGreaterThanOrEqual(3);
  });

  it.each(Object.entries(HARD))('keeps the lamp of %s gentle enough to read a row through', (_, given) => {
    const lit = mix(organizationColor(given, 'lamp', theme), strength, surfaces.card);
    const ink = theme === 'light' ? '#0b1a1b' : '#e6f0f0';
    expect(contrast(ink, lit)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the worst input', () => {
  /**
   * docs/design/09-accessibility.md publishes the worst ratio over every input
   * tested. If a change to the role table makes the worst case worse than the
   * document says, the document and the change have to be looked at together.
   */
  it.each([['light', 6.8], ['dark', 6.2]])('in the %s theme clears %s to 1 on its lamp', (theme, floor) => {
    const strength = LAMP_AT_REST[theme];
    const card = SURFACE[theme].card;
    const worst = Math.min(
      ...Object.values(HARD).map(given => {
        const { text, lamp } = organizationColors(given, theme);
        return contrast(text, mix(lamp, strength, card));
      }),
    );
    expect(worst).toBeGreaterThanOrEqual(floor);
  });

  it('shows a mark in neon yellow on paper, the hardest case, at 4.3 to 1', () => {
    expect(contrast(organizationColor('#ffff00', 'mark', 'light'), '#f5fafa')).toBeGreaterThanOrEqual(4.3);
  });
});
