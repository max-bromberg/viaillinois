# Handoff: implement the VIA design system

This file is the opening assignment for the session that converts the VIA client to the
approved design system. Read it first, then the documents it points to, then begin at
step 1. Nothing in this directory is a suggestion; it is the approved look, and the
reference render is the acceptance test.

## What you are doing

Converting the Svelte client of VIA (Virtually Integrated Agenda), the event platform for
the Electrical and Computer Engineering department's student organizations at the
University of Illinois Urbana-Champaign, from its current stock component kit to the design
system in this directory, one gated pull request at a time, without breaking the site for
the students and board members using it in production.

## Read, in this order

1. `/CLAUDE.md` at the repository root. Its rules are not negotiable: test first, the
   release gate decides, never commit unless asked, every schema change is a migration, new
   data access in Drizzle, deploys only through the cutover script, and the user facing
   language constraints.
2. `docs/design/README.md`, then documents 01 through 11 in order.
3. `docs/design/foundation.html` in a browser at 1280 px wide, in both themes. This is
   what you are building. `reference/foundation.css` beside it is the normative stylesheet.
4. `client/src/app.css`, `client/tailwind.config.js`, `client/src/App.svelte`,
   `client/src/lib/NavBar.svelte`, `client/src/routes/Home.svelte`,
   `client/src/lib/EventCard.svelte`, `client/src/lib/TagFilter.svelte`,
   `client/src/routes/Midterms.svelte`, `client/src/routes/Kiosk.svelte`, and
   `client/src/lib/CircuitBackground.svelte`, to see what is being replaced.
5. `client/tests/lib/themeContrast.test.js` and `client/tests/setup.js`, to see how the
   client is tested today.

## The order of work

Follow the sequence in `11-implementation.md` exactly: tokens and typefaces, then the
primitives, then the composed parts, then the surfaces one at a time, then the sky's clock.
Each step is its own pull request to `main` and must pass the gate. Do not start step 2
before step 1 has merged.

## Definition of done for each step

- The failing tests were written first and now pass, and the whole client suite passes.
- The language check passes.
- The gate passes.
- The surface or component, rendered at 1280 px against sample data in both themes, matches
  the corresponding block of `foundation.html`. Attach both screenshots to the pull request.
- The review checklist at the end of `11-implementation.md` is clean.
- No document in `docs/design` disagrees with what shipped. If you had to deviate, change
  the document in the same pull request and say why in the pull request body.

## Decisions already made, so do not reopen them

- The mark, its color and its placement do not change.
- The flat palette does not change.
- Organization colors are adapted in OKLCH as specified in `04-color.md`; they are never
  clamped at entry or shown raw.
- The highlighter stays a half height stroke.
- The sky follows the campus hour, not the theme preference, and lives only in the top band.
- Bits UI is the only headless dependency kept; shadcn-svelte is removed.
- Bricolage Grotesque, IBM Plex Sans and IBM Plex Mono are self hosted from the files in
  `docs/design/fonts`, and a test asserts each covers U+0020 through U+007E.

## Things that will bite

- The font subset bug. Revisions 1 through 3 of the design were reviewed on font files that
  contained almost no letters, because a stylesheet parser paired subset comments with the
  wrong blocks. Verify character coverage in a test before trusting any font file.
- The cut clips borders. An outlined cut shape is two chamfered layers; see `06-shape-space-motion.md`.
- Selectors that reach inner elements. Twice during the design a rule written for outer
  rows matched the wrapper inside them. Scope structural rules with the child combinator.
- The `.dark` class. The client toggles a class today; the reference stylesheet uses a
  `data-theme` attribute and a media query. Map the class to the same values in step 1
  rather than changing the mechanism, and change the mechanism only if the tests say the
  first paint still avoids a flash.
- `color-mix()` and `clip-path` with `calc()`. Both are used throughout. Check the
  browserslist the client builds for and add fallbacks only where a supported browser
  lacks them.
- The kiosk rotates every eight seconds and refreshes every minute. Keep both intervals, and
  keep the canvas board cheap; it draws once per resize, not per frame.

## What to report back

At the end of each step, a short summary in the pull request: what changed, the two
screenshots, any deviation from the documents and why, and the next step. If a document in
this directory turns out to be wrong or incomplete, fixing it is part of the step.
