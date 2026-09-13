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

The client does not retype any of it. `client/scripts/designRules.js` reads the rules out of
`reference/foundation.css` in the order that file writes them, because that order is the
cascade the reference render is drawn with, and `client/scripts/syncDesignCss.js` writes them
into `client/src/app.css` between markers. Run `node scripts/syncDesignCss.js` from the
client directory after any change to the reference stylesheet.
`client/tests/lib/designCss.test.js` derives the same block and compares, and
`client/tests/lib/designTokens.test.js` compares the token blocks, so a value that has
drifted from the approved stylesheet fails the gate rather than reaching a screen.

The reference stylesheet dresses its own page as well: a masthead, section headings, a table
of contrast readings. Those rules stay behind. What comes across is named in
`designRules.js`, one list per step, so that what the client carries is a decision somebody
made rather than whatever happened to be in the file.

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

Three more parts were added that this document did not name, each because of a rule it does
state, and all three are described in the component document. `Icon` draws the eight shapes
the reference render uses, because the site it replaced used emoji and those draw
differently on every platform. `Mark` inlines the mark, because it is white on the kiosk and
on the night sky and an image cannot be recolored. `Trace` is the one ornament the system
permits, in the places the look document names.

### Step 3: the composed parts

`Button`, `Field`, `Switch`, `Dial`, `Toast`, `EmptyState`, `SkyBand` (with `Nav`,
`Greeting`, `Clock`), `DayGroup`, `EventRow`, `Poster`, `TermRibbon`, `ExamRow`,
`KioskStage`, `KioskRail`. Each is built to the component document and checked against the
matching block of `foundation.html` by rendering both at 1280 px and comparing.

Two pieces of shared logic sit beside them, because more than one part needs each and two
copies would drift. `client/src/lib/tagHue.js` decides which of the eight hues a tag is
drawn in: the color document says the platform assigns one when a tag is created and the
platform does not store one yet, so until it does the hue is derived from the tag's name.
`client/src/lib/campusTime.js` gains `campusDayName`, `campusShortDate` and `campusSky`, so
that the agenda, the clock and the kiosk rail name a day the same way and the band and the
agenda read one clock.

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
| the rules, copied from the reference | `client/scripts/designRules.js`, `client/scripts/syncDesignCss.js` |
| the organization colour and the tag hue | `client/src/lib/organizationColor.js`, `client/src/lib/tagHue.js` |
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
