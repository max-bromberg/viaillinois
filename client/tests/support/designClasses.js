import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The class names the design system claims globally, and who is borrowing them.
 *
 * Svelte scopes the rules a component writes, which raises their specificity,
 * and it does nothing at all to stop a global rule matching the same class on
 * the same element. The design system's names are short and ordinary: .page,
 * .day, .nav, .empty. A component that names an element one of those is handed
 * every declaration the global rule carries and the component never mentions.
 *
 * That is not a theoretical tidiness problem. It shipped three visible faults
 * in one release. Global .day is a two column grid of 118px and a fraction, and
 * it was landing on all forty two day buttons of the calendar on the create
 * event form. Global .page is the site's two column page grid with 28px of
 * padding, and it was landing on every page number in the feed's pager. Global
 * .empty paints an evening sky, and it was landing on the date field whenever
 * no date had been chosen.
 */
export function globalRoots(css = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8')) {
  const opens = css.indexOf('/* >>> design system');
  const closes = css.indexOf('/* <<< design system */');
  const block = css.slice(opens, closes);
  const roots = new Set();
  for (const match of block.matchAll(/(^|[}\s])\.([a-z][a-z0-9-]*)(?=[{\s.,:])/gm)) {
    roots.add(match[2]);
  }
  return roots;
}

/**
 * Every design system class name carried by an element inside a rendered tree,
 * sorted, so a failure names what to rename rather than only that something is
 * wrong.
 */
export function borrowedIn(container, roots = globalRoots()) {
  const borrowed = new Set();
  for (const element of container.querySelectorAll('[class]')) {
    for (const name of element.classList) {
      // Svelte's own scoping hashes are not class names anybody wrote.
      if (name.startsWith('s-') || name.startsWith('svelte-')) continue;
      if (roots.has(name)) borrowed.add(name);
    }
  }
  return [...borrowed].sort();
}
