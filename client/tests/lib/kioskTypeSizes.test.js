import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rulesOf } from '../../scripts/designRules.js';

/**
 * What the lobby screen is actually set in.
 *
 * The screen is read from across a room rather than from a desk, so almost
 * every size on it was lifted a step or two. Two of those lifts never reached a
 * screen. The reference stylesheet states a rule and corrects it further down
 * the file, and a group near the end gathers the small caption sizes of the
 * reading surfaces and sets them to twelve pixels. Two kiosk selectors were in
 * that group, so the date under the clock was written at twenty six pixels and
 * rendered at twelve, and the caption under each item in the rail was written
 * at thirteen and rendered at twelve.
 *
 * Nothing catches this by reading one rule, because the rule is right. Two
 * rules of equal weight are settled by which comes last, so what a selector is
 * really set in is the last thing the file says about it.
 */
const reference = readFileSync(
  resolve(process.cwd(), '../docs/design/reference/foundation.css'), 'utf8',
);

/**
 * The font size a selector ends up with, which is the last one the file gives
 * it, whether on its own or inside a list.
 */
function lastFontSizeFor(selector) {
  let found = null;
  for (const rule of rulesOf(reference)) {
    const names = rule.selector.split(',').map(part => part.trim());
    if (!names.includes(selector)) continue;
    const size = /font-size:\s*([^;}]+)/.exec(rule.text.slice(rule.selector.length));
    if (size) found = size[1].trim();
  }
  return found;
}

describe('the sizes the lobby screen is read at', () => {
  it('sets the date under the clock in the display face, not in a caption size', () => {
    expect(lastFontSizeFor('.kiosk .k-top .d')).toBe('26px');
  });

  it('keeps the caption under a rail item at the size the rail was lifted to', () => {
    expect(lastFontSizeFor('.kiosk .side .item .t small')).toBe('13px');
  });

  it('leaves the reading surfaces in the caption size they share', () => {
    // The group those two were taken out of belongs to the pages somebody
    // reads at a desk, and it is still right for them.
    expect(lastFontSizeFor('.day .dh span:not(.pad)')).toBe('12px');
    expect(lastFontSizeFor('.ribbon .wkc span')).toBe('12px');
    expect(lastFontSizeFor('.poster .link')).toBe('12px');
  });
});
