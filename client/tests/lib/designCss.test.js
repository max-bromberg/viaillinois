import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { designBlock, OPENS, CLOSES } from '../../scripts/syncDesignCss.js';
import { collect, reference, PRIMITIVE_SELECTORS } from '../../scripts/designRules.js';

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
