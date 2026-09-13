import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pad, Cut, Lamp, Highlight, Sky, Numeral } from '../../../src/lib/components/ui/index.js';

/**
 * What is true of every primitive.
 *
 * docs/design/07-components.md asks that each is styled from tokens, carries no
 * raw hex value, and renders in both themes. The first two are the ones that
 * rot: a colour typed into a component to make one screen look right survives
 * every review, and then the theme changes underneath it.
 */
const UI = resolve(process.cwd(), 'src/lib/components/ui');

const PRIMITIVES = [
  ['Pad', Pad, {}],
  ['Cut', Cut, {}],
  ['Lamp', Lamp, {}],
  ['Highlight', Highlight, {}],
  ['Sky', Sky, {}],
  ['Numeral', Numeral, { value: 2, unit: 'tonight in ECEB' }],
];

/**
 * The design system's own directories, primitives and composed parts alike. The
 * three lowercase ones beside them are what is left of the stock component kit,
 * and they go when the last screen that imports them is converted in step 4 of
 * docs/design/11-implementation.md.
 */
function directories() {
  return readdirSync(UI, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^[A-Z]/.test(entry.name))
    .map(entry => entry.name);
}

/** What is left of the stock component kit, which step 4 removes. */
function stock() {
  return readdirSync(UI, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^[a-z]/.test(entry.name))
    .map(entry => entry.name)
    .sort();
}

function asTheme(theme, draw) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.setAttribute('data-theme', theme);
  return draw();
}

afterEach(() => {
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-theme');
});

describe('every primitive', () => {
  it.each(PRIMITIVES)('%s draws the same markup in both themes', (name, Component, props) => {
    const light = asTheme('light', () => render(Component, props).container.innerHTML);
    const dark = asTheme('dark', () => render(Component, props).container.innerHTML);
    // A primitive is styled from tokens, and a token is the same name in both
    // themes. A primitive that drew itself differently would be deciding the
    // theme's colours somewhere the contrast test cannot see them.
    expect(dark).toBe(light);
  });

  it.each(PRIMITIVES)('%s carries no raw hex value in what it renders', (name, Component, props) => {
    for (const theme of ['light', 'dark']) {
      const html = asTheme(theme, () => render(Component, props).container.innerHTML);
      expect(html, `${name} rendered a hex colour in the ${theme} theme`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it.each(directories())('%s ships a component, an index and a test', directory => {
    const files = readdirSync(resolve(UI, directory));
    expect(files).toContain(`${directory}.svelte`);
    expect(files).toContain('index.js');
    expect(readdirSync(resolve(process.cwd(), 'tests/lib/ui'))).toContain(`${directory}.test.js`);
  });

  it.each(directories())('%s holds no raw hex value in its source, outside the one the night band needs', directory => {
    const source = readFileSync(resolve(UI, directory, `${directory}.svelte`), 'utf8');
    const found = [...source.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(match => match[0]);
    // Two places cannot take a colour from a token that changes with the theme.
    // The night band is dark in either theme, so its ink is the light ink, the
    // secondary ink and the muted grey of the dark palette, and the contrast test
    // holds those against every sky. The mark is white on the kiosk and on the
    // night sky, which docs/design/03-the-look.md states outright as the one
    // variation the mark takes; its teal is the --mark token.
    const allowed = new Set(['#e6f0f0', '#c3d3d3', '#8fa8a8', '#ffffff']);
    expect(found.filter(value => !allowed.has(value.toLowerCase()))).toEqual([]);
  });

  it('carries every primitive the component document names', () => {
    for (const primitive of ['Cut', 'Highlight', 'Lamp', 'Numeral', 'Pad', 'Sky']) {
      expect(directories(), `${primitive} is missing`).toContain(primitive);
    }
  });

  /**
   * Two parts are drawn by the site that the component document does not name,
   * and both exist because of rules the document does state. Icons are drawn
   * rather than typed, because the first version of the site used emoji and they
   * draw differently on every platform. The mark is inlined rather than loaded as
   * an image, because it is white on the kiosk and on the night sky and an image
   * cannot be recoloured. Both are recorded in 07-components.md.
   */
  it('carries the two parts the site draws that the component document gained later', () => {
    expect(directories()).toContain('Icon');
    expect(directories()).toContain('Mark');
    expect(directories()).toContain('Trace');
  });

  /**
   * The stock kit is on its way out. This says what is left of it, so that the
   * step which removes the last of it has to come here and say so too.
   */
  it('leaves only the three stock components still to be replaced', () => {
    expect(stock()).toEqual(['button', 'input', 'label']);
  });
});
