# 09 Accessibility

The look is built to meet WCAG 2.2 level AA without looking like it tried. What follows is
what is guaranteed, the measurements behind it, and the three decisions the team took where
a guideline met the look.

## Guaranteed

- Every control has a visible focus state. On a cut button the ring is the border layer
  itself at 3 px in primary, so it keeps the button's shape. Every other control gets a 2 px
  primary outline set 4 px out.
- Meaning never rides on color alone. Pads are filled or hollow. The lamp is always beside
  the organization's name. The term ribbon prints its count on every week. A live event
  says "Happening now" in words. A cancelled event is struck through and says so.
- Every pad control, tag and organization mark sits inside a 32 px target. The ink of the
  pad stays 12 px.
- Nothing is set below 12 px. The faint gray is used for hairlines and hollow pads only,
  never for words.
- All five movements stop under `prefers-reduced-motion: reduce`, including the drifting
  sky and the breathing pad.
- Day names are headings. Times carry machine readable datetimes. The greeting is a live
  region that announces once when the counts arrive. The toast is a status region.
- Text on a sky band uses ink or secondary ink. The night sky switches the band to light
  ink. Every sky is measured against both inks at its top edge, where contrast is lowest.
- Icons never appear without a label, except in the dial, where each icon has an accessible
  name.
- The site works with the keyboard alone, in reading order, with skip links to the agenda
  and to the rail.

## Measured pairs

Ratios are WCAG contrast ratios. AA is 4.5 to 1 for text and 3 to 1 for large text (at
least 24 px, or 18.66 px bold) and for graphics.

| Pair | Ratio | Result |
| --- | --- | --- |
| ink on paper | 16.9 : 1 | AAA |
| muted text on paper, light and dark | 5.8 and 7.4 : 1 | AA |
| white on the primary button | 5.0 : 1 | AA |
| primary foreground on the dark primary | 8.0 : 1 | AAA |
| ink on the dusk sky, top edge | 12.9 : 1 | AAA |
| secondary ink on the dusk sky, top edge | 8.3 : 1 | AAA |
| ink on the morning and afternoon skies | 16.0 and 15.3 : 1 | AAA |
| light ink on the night sky, light theme | 14.2 : 1 | AAA |
| light ink on every dark theme sky | 12.5 to 17.2 : 1 | AAA |
| highlighter text on its stroke, worst hue, light | 4.8 : 1 | AA |
| highlighter text on its stroke, worst hue, dark | 4.9 : 1 | AA |
| status highlighter on its stroke in a well, worst status, light | 5.2 : 1 | AA |
| adapted organization name on its lamp, worst input, light | 6.9 : 1 | AA |
| adapted organization name on its lamp, worst input, dark | 6.2 : 1 | AA |
| adapted organization mark on paper, worst input | 4.3 : 1 | AA for graphics |
| signal count on the dusk sky, 30 px bold | 3.7 : 1 | AA large |
| time numerals on a lit row | 14 : 1 or better | AAA |
| danger text on paper | 5.5 : 1 | AA |

The theme contrast test in the client (`client/tests/lib/themeContrast.test.js`) is
extended to hold every pair in this table, in both themes, so a token change that breaks
one fails the gate.

## Decisions taken

1. **Organization colors are adapted, not clamped or dropped.** Each organization keeps its
   chosen color in its settings; the site bends it into VIA's range in the OKLCH color
   space, keeping the hue. The name stays colored, and every input clears 6 to 1 on its
   lamp. The method is in the color document.
2. **The highlighter stays a half height stroke.** The text clears AA against the stroke,
   which is the strictest background behind it, so there is no reason to widen it. A tag is
   drawn on a row or on paper, and never in a well. The one well surface in the agenda is a
   cancelled row, which carries a status and no tags, and the eight hues fall to 4.4 to 1
   that far down while every status hue still clears 5.1 to 1. The contrast test holds the
   two sets against the surfaces each is actually drawn on.
3. **The sky follows the window, not the theme preference.** A person who chose the light
   theme still gets a dark band at night, with light ink on it. The page below the band
   stays light. This was considered and kept because the band is the site's clock.

## What to check when adding a screen

- Run the contrast test. Add any new pair to it.
- Tab through the screen. Every stop is visible and in reading order.
- Turn on reduced motion. Nothing moves.
- Zoom to 200 percent. Nothing is clipped and nothing overlaps.
- Read it with a screen reader. Headings describe the structure, controls have names, and
  the live regions speak once.
