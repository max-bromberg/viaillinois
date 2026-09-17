import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The header of a listing has to sit over the columns it names.
 *
 * Every row wrote the column widths itself, and the last of those columns is
 * sized to its own content. The header's last cell is the words "What you can
 * do" and a row's last cell is four buttons, so the two resolved to different
 * widths, and because the columns before them are fractions, every one of them
 * moved with it. Measured at 1280px the header's cells stood 125 to 292 pixels
 * to the right of the cells they were naming, so "When" sat over the column
 * saying who can see the event and the last heading sat over nothing at all.
 *
 * One grid owns the columns now and each row takes them as a subgrid, so there
 * is one set of widths for the whole listing and the header cannot drift from
 * the rows again. The check is on the rule rather than on a rendered width,
 * because jsdom does no layout: what is asserted is the arrangement that makes
 * the drift impossible.
 */
const dashboard = readFileSync(resolve(process.cwd(), 'src/routes/Dashboard.svelte'), 'utf8');

/** The declarations of one rule in the component's stylesheet. */
function ruleFor(selector) {
  const at = dashboard.indexOf(`\n  ${selector} {`);
  if (at === -1) return null;
  return dashboard.slice(at, dashboard.indexOf('}', at));
}

describe('the listings on the logistics dashboard', () => {
  it('gives the columns to the listing rather than to each row', () => {
    expect(ruleFor('.listing')).toMatch(/grid-template-columns:/);
  });

  it('has every row take the listing\'s own columns', () => {
    const row = ruleFor('.row');
    expect(row).toMatch(/grid-template-columns:\s*subgrid/);
    expect(row).toMatch(/grid-column:\s*1\s*\/\s*-1/);
  });

  it('does not let a row write column widths of its own', () => {
    // A row that names its own widths is a row that can disagree with the
    // header again, which is the whole of the fault.
    const row = ruleFor('.row');
    expect(row).not.toMatch(/grid-template-columns:\s*minmax/);
  });

  it('gives the members listing its own columns, on the listing', () => {
    expect(ruleFor('.members')).toMatch(/grid-template-columns:/);
  });

  it('spans anything in a listing that is not a row across the whole width', () => {
    // The members listing puts a sentence where the rows would be when there
    // are none, and a subgrid child with no span lands in the first column.
    expect(ruleFor('.listing > .none')).toMatch(/grid-column:\s*1\s*\/\s*-1/);
  });
});
