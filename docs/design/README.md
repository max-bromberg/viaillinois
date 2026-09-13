# The VIA design system

This directory holds the design system for VIA (Virtually Integrated Agenda): why the site
looks the way it does, what the look is, the principles behind it, what must not change, and
how to build it. It was approved in September 2026 after four design revisions, and it is the
reference for every screen the platform draws from here on.

Read the documents in order the first time. After that, each one stands on its own.

| Document | What it answers |
| --- | --- |
| [01 Why this look](01-why-this-look.md) | Who the site is for, what was wrong before, and what the redesign set out to do. |
| [02 Philosophy](02-philosophy.md) | The eight commitments every screen keeps, each with its reason and its test. |
| [03 The look](03-the-look.md) | The identity in one place: the mark, the sky, the voice, color as light, the cut, the pad, the trace, and the numerals. |
| [04 Color](04-color.md) | Every color token in both themes, the four skies, the gradients, the lamp, the highlighter, status, and how organization colors are adapted. |
| [05 Typography](05-typography.md) | The three faces, the type roles with sizes and tracking, and the rules for setting numbers. |
| [06 Shape, space and motion](06-shape-space-motion.md) | The cut, the spacing scale, elevation, and the five permitted movements. |
| [07 Components](07-components.md) | The primitives and the composed parts, with states, sizes and behavior. |
| [08 Surfaces](08-surfaces.md) | How each page of the site is composed from the parts. |
| [09 Accessibility](09-accessibility.md) | What is guaranteed, the measured contrast pairs, and the decisions taken. |
| [10 Voice](10-voice.md) | How the site speaks, and the language rules every string must pass. |
| [11 Implementation](11-implementation.md) | The sequence of work, file locations, token mapping, font hosting, tests, and the review checklist. |

`foundation.html` in this directory is the approved reference render. It draws every token,
component and page mockup from the same values these documents describe, in both themes,
and it is the page to open when a written rule is ambiguous. It loads the typefaces from the
`fonts` directory beside it.

## A short glossary

These documents use a small vocabulary for the devices that make up the look. Each word is
also the name of the component that will implement it.

- **The sky.** The gradient band at the top of every page, colored by the campus hour.
- **The pad.** A small rotated square. The one primitive behind checkboxes, organization
  marks, switch thumbs, the theme dial, field markers and the active page marker.
- **The lamp.** An organization's color falling across a surface from its top left corner.
- **The highlighter.** A stroke of color under the lower half of a word. Used for tags and
  statuses.
- **The cut.** A 45 degree chamfer on one corner of a shape, taken from the end of the
  strokes in the mark.
- **The trace.** A line that turns at 45 degrees and ends in a pad, drawn from the circuit
  board that has always sat behind the site.
- **A numeral.** A number set large in the condensed display face, followed by its meaning
  in words, never enclosed in a tile.
