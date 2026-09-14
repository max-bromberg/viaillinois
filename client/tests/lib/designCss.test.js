import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { designBlock, OPENS, CLOSES } from '../../scripts/syncDesignCss.js';
import { collect, collectFor, reference, PRIMITIVE_SELECTORS } from '../../scripts/designRules.js';

/**
 * The client's rules are the reference stylesheet's rules.
 *
 * The implementation document makes docs/design/reference/foundation.css normative and
 * the reference render the acceptance test, so a rule that has been retyped, or
 * a value that has been nudged to make one screen look right, is a defect even
 * when the screen it was nudged for looks better. The block between the markers
 * in src/app.css is derived from the reference by scripts/syncDesignCss.js, and
 * this derives it again and compares.
 */
const APP = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

describe('the design system rules in app.css', () => {
  it('are exactly the block derived from the reference stylesheet', () => {
    const opensAt = APP.indexOf(OPENS);
    const closesAt = APP.indexOf(CLOSES);
    expect(opensAt, 'src/app.css has no design system markers').toBeGreaterThan(-1);
    expect(APP.slice(opensAt, closesAt + CLOSES.length)).toBe(designBlock());
  });

  it('carry every primitive the component document names', () => {
    for (const selector of ['.pad', '.pad.hollow', '.pad.lit', '.cut', '.cutbl', '.hl', '.hl.off', '.ocut']) {
      expect(APP, `${selector} is missing`).toContain(`${selector}{`);
    }
  });

  /**
   * The rule reaches pseudo elements as well as elements. Written against the
   * universal selector alone it matched neither ::before nor ::after, and the
   * breathing pad on the current week of the term ribbon is drawn on one, so
   * that movement would have kept going for somebody who asked for stillness.
   */
  it('stop every movement for anybody who asks for reduced motion', () => {
    expect(APP.replace(/\s+/g, '')).toContain(
      '@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important',
    );
  });

  it('keep the cascade the reference is drawn with', () => {
    // The reference states a rule and then corrects it further down the file.
    // The highlighter's colour is the clearest case: revision 4 takes it from 70
    // percent of the hue to 62. Copied in the wrong order the client would ship
    // the ratio the accessibility document says was fixed.
    const rules = collect(reference(), PRIMITIVE_SELECTORS).filter(rule => rule.selector === '.hl');
    expect(rules.length).toBeGreaterThan(1);
    const positions = rules.map(rule => APP.indexOf(rule.text));
    expect(positions.every(at => at > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(rules.at(-1).text).toContain('62%');
  });
});

/**
 * A media query in the reference dresses the client and the reference's own
 * page from one block. The first version of the collector kept a second copy of
 * that block's body here, which put the two out of step the moment either was
 * edited: the whole reason the rules are read out of the file rather than
 * retyped. The body is filtered by the same ownership test the ordinary rules
 * use instead, so a rule added to the reference's narrow layout reaches the
 * client without anybody editing the collector.
 */
describe('a media query the reference shares with its own page', () => {
  const CSS = '@media (max-width:900px){'
    + '.sh,.poster .body2{grid-template-columns:1fr}'
    + '.comps{display:none}'
    + '.page{grid-template-columns:1fr}'
    + '}';

  it('keeps the rules the client owns and leaves the reference page behind', () => {
    const [rule] = collectFor(CSS, {
      selectors: ['@media (max-width:900px)'],
      roots: ['poster', 'page'],
    });
    expect(rule.text).toBe('@media (max-width:900px){'
      + '.poster .body2{grid-template-columns:1fr}'
      + '.page{grid-template-columns:1fr}'
      + '}');
  });

  it('takes a rule added to the reference without the collector being edited', () => {
    const [rule] = collectFor(CSS.replace('.comps{display:none}', '.comps{display:none}.page{padding:16px}'), {
      selectors: ['@media (max-width:900px)'],
      roots: ['poster', 'page'],
    });
    expect(rule.text).toContain('.page{padding:16px}');
  });

  it('drops the at rule altogether when the client owns none of it', () => {
    expect(collectFor(CSS, { selectors: ['@media (max-width:900px)'], roots: ['exam'] })).toEqual([]);
  });
});

/**
 * The narrow layout.
 *
 * The reference render was drawn at 1280 px and its own narrow block stops at
 * the page grid, so the client shipped a navigation 934 px wide inside a 400 px
 * screen and an agenda squeezed into eighty. VIA is read on a phone more often
 * than on anything else, so the phone block was added to the reference
 * stylesheet, described in docs/design/06-shape-space-motion.md, and collected
 * like every other rule.
 */
describe('the phone layout', () => {
  const PHONE = APP.slice(APP.indexOf('@media (max-width:640px)'));

  it('is in the block derived from the reference', () => {
    expect(APP).toContain('@media (max-width:640px){');
    expect(designBlock()).toContain('@media (max-width:640px){');
  });

  it('lets the navigation wrap instead of running off the screen', () => {
    expect(PHONE).toContain('.nav{');
    expect(PHONE).toContain('flex-wrap:wrap');
  });

  it('stacks the agenda, the day and the event row into one column', () => {
    for (const rule of ['.day{grid-template-columns:1fr', '.ev{grid-template-columns:1fr']) {
      expect(PHONE, `${rule} is missing`).toContain(rule);
    }
  });

  it('takes the page gutter to the sixteen pixels the spacing table gives a phone', () => {
    expect(PHONE).toMatch(/\.page\{[^}]*padding:\d+px 16px/);
    expect(PHONE).toMatch(/\.greet\{[^}]*padding:\d+px 16px/);
  });
});

/**
 * A secondary button is an outline with the surface behind it showing through
 * the middle, and the middle was filled with paper wherever it stood. On the
 * night sky band that is wrong twice over: the band is dark in both themes and
 * fixes its own ink light, so under the light theme the button drew light text
 * on a near white fill and the sign out control in the header had no visible
 * label at all. The fill is a token now, and the band says what it is.
 */
describe('an outlined button fills with what it stands on', () => {
  const APP_CSS = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

  it('reads its fill from a token rather than always from paper', () => {
    expect(APP_CSS).toContain('.btn.secondary.cut::before{background:var(--btn-fill,var(--paper))}');
  });

  it('is told by the night band that it stands on the night sky', () => {
    const band = APP_CSS.slice(APP_CSS.indexOf('.skyband.night{'));
    expect(band.slice(0, band.indexOf('}'))).toContain('--btn-fill:var(--sky-night-top)');
  });

  it('has a night sky top colour in both themes, because the band is dark in both', () => {
    // Two definitions for the dark theme, the system preference and the stamped
    // choice, and one for the light theme, which is how every other token in
    // this stylesheet is written.
    expect(APP_CSS.match(/--sky-night-top:/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
