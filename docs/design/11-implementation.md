# 11 Implementation

How to build the look into the client so that what ships matches `foundation.html` exactly.
The non negotiable rules in the repository's `CLAUDE.md` apply throughout: test first, the
release gate decides, every schema change is a migration, no commit without being asked,
new data access in Drizzle, production deploys through the cutover script.

## What is normative

1. `reference/foundation.css` and `foundation.html` in this directory. Every value in the
   client comes from them. When a document and the stylesheet disagree, the stylesheet wins
   and the document is corrected in the same change.
2. The token tables in the color, typography and shape documents, which restate the
   stylesheet's custom properties.

## Sequence of work

Each step is a pull request against `main` through the gate, and each step leaves the site
working. Do not start a step before the previous one has merged.

### Step 1: tokens and typefaces

- Replace the custom properties in `client/src/app.css` with the token block from
  `reference/foundation.css` (the `:root`, the two dark blocks, and nothing else), keeping
  the existing `.dark` class mechanism by mapping it to the same values as the
  `[data-theme="dark"]` block. Keep the old property names as aliases for one step so that
  existing screens keep working, then remove the aliases in step 4.
- Add the display, sans and mono families and the Current and Board gradients to
  `client/tailwind.config.js`. Remove the shadcn radius scale.
- Copy the four font files from `docs/design/fonts` to `client/public/fonts` and the
  `@font-face` rules from `reference/fonts.css` into `app.css` with the paths updated.
- Add a test under `client/tests` that opens each shipped font file and asserts its
  character map covers U+0020 through U+007E. This exists because the design review ran
  for three revisions on files that did not.
- Extend `client/tests/lib/themeContrast.test.js` to every pair in the accessibility
  document, in both themes. Write the failing tests first, then set the tokens.

### Step 2: the primitives

Under `client/src/lib/components/ui`, one directory per component, each with the component,
an index, and a test that renders it in both themes and checks its states: `Pad`, `Cut`,
`Lamp`, `Highlight`, `Sky`, `Numeral`. Remove the three shadcn-svelte components (`button`,
`input`, `label`) once nothing imports them. Add `organizationColor.js` under
`client/src/lib` with the OKLCH adaptation from the color document, tested against the
inputs listed there.

### Step 3: the composed parts

`Button`, `Field`, `Switch`, `Dial`, `Toast`, `EmptyState`, `SkyBand` (with `Nav`,
`Greeting`, `Clock`), `DayGroup`, `EventRow`, `Poster`, `TermRibbon`, `ExamRow`,
`KioskStage`, `KioskRail`. Each is built to the component document and checked against the
matching block of `foundation.html` by rendering both at 1280 px and comparing.

### Step 4: the surfaces, one at a time

The feed, then the event page, then midterms, then the kiosk, then the calendar, then the
dashboard, the scheduler and the poster designer, then the reading pages, login and
account. Each surface is one pull request. The old aliases from step 1 are removed when the
last surface that used them lands.

### Step 5: the sky's clock

The `Sky` component reads the campus hour from the same source the feed already uses to
decide what is upcoming (`client/src/lib/campusTime.js`), so the band and the agenda never
disagree about what time it is.

## Where things live

| Thing | Location |
| --- | --- |
| tokens | `client/src/app.css` |
| Tailwind mapping | `client/tailwind.config.js` |
| fonts | `client/public/fonts`, declared in `app.css` |
| primitives and composed parts | `client/src/lib/components/ui/<Name>/` |
| organization color adaptation | `client/src/lib/organizationColor.js` |
| the sky's hour | `client/src/lib/campusTime.js` |
| contrast and font tests | `client/tests/lib/` |
| this system | `docs/design/` |

## Verifying against the reference

Open `docs/design/foundation.html` in a browser at 1280 px wide. Each mock in it is the
acceptance render for its surface. When a surface lands, screenshot it against sample data
at the same width and hold the two side by side: type sizes, spacing, the lamp, the cut, the
tracking. Differences are defects unless the design documents are changed in the same pull
request to match, with a reason.

## Review checklist

A pull request that touches the interface is checked against this list before review.

- No eyebrow label above a heading.
- No color bar or stripe on the edge of any element, except the 2 px trace on a calendar
  entry.
- No filled pill for a status or a tag.
- No number inside a bordered tile.
- No rounded rectangle with a one pixel border as a container.
- No shadow on anything that does not float.
- No gradient outside the sky, the primary button, the lamp and the kiosk board.
- No emoji in place of an icon.
- No raw hex value outside the token file.
- No negative tracking on the condensed display face.
- No text below 12 px, and no words in the faint gray.
- Every new color pair is in the contrast test.
- Every control has a focus state and a 32 px target.
- Every movement is one of the five, and stops under reduced motion.
- Every string passes the language rules, and the language check is green.
