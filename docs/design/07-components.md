# 07 Components

Every component is written by us as a Svelte 5 component under the client's shared
component directory. Each is styled from tokens, ships with a test that renders it in both
themes, and carries no raw hex value. The selectors named below are the ones in
`reference/foundation.css`, which is normative: when this document and that file disagree,
the file wins and this document is corrected.

Bits UI was going to be the headless layer for menus, dialogs, popovers and the date
picker, for keyboard and screen reader behavior only. It is not a dependency of the client
and nothing imports it, so the keyboard and screen reader behavior of each of those is
written here and covered by that component's own tests. The calendar below is the first of
them.

The rules are not retyped into the client. `client/scripts/designRules.js` reads them out of
`reference/foundation.css` in the order that file writes them, because that order is the
cascade the reference render is drawn with, and `client/scripts/syncDesignCss.js` writes
them into `client/src/app.css` between markers. A test derives the same block and compares,
so a rule that has drifted from the reference fails the gate.

## Primitives

### Pad (`.pad`)

A 10 px square (12 px as a control) with a 2.5 px radius, rotated 45 degrees and scaled to
0.85, colored by `--h`.

| State | Appearance |
| --- | --- |
| filled | solid `--h` |
| hollow (`.hollow`) | transparent with a 1.5 px border in `--h` |
| lit (`.lit`) | filled with a 4 px halo of `--h` at 22 percent |
| breathing | lit, with the pulse animation |

Uses: checkbox, organization mark, switch thumb, dial needle, field marker, active page
marker, the day marker in the agenda, the marker beside a quiet button's label. As a control
it sits inside a 32 px target and takes a 2 px primary outline 4 px out on focus.

### Cut (`.cut`, `.cutbl`)

The chamfer described in the shape document, applied by a wrapper that takes the corner
and the size. An outlined variant provides the two layer border.

### Lamp

A radial gradient background from the top left corner in an organization's adapted lamp
color, at the strengths in the color document. Implemented on the event row as:

```css
background: radial-gradient(560px 200px at 0% 0%, color-mix(in srgb, var(--h) var(--lamp), var(--card)), var(--card) 72%);
```

`--lamp` is 14 percent in light and 22 percent in dark, and rises on hover.

### Highlight (`.hl`)

A word with a marker stroke under it.

```css
.hl { position: relative; isolation: isolate; font-weight: 500; white-space: nowrap;
  color: color-mix(in srgb, var(--h) 62%, var(--ink)); }
.hl::before { content: ""; position: absolute; left: -4px; right: -4px; bottom: -1px; height: 52%;
  background: color-mix(in srgb, var(--h) 30%, transparent);
  transform: skewX(-10deg) rotate(-1.2deg); z-index: -1; border-radius: 2px; }
.hl.off { color: var(--muted); font-weight: 400; }
.hl.off::before { background: transparent; border-bottom: 1.5px dotted var(--line-strong); height: 0; bottom: -2px; transform: none; }
```

As a tag filter it is a toggle button with `aria-pressed`. As a status it is a plain span.
A row of highlights (`.hlrow`) has a 2 px row gap and an 18 px column gap, and each has a
32 px minimum height so it can be hit.

A tag is drawn on a row or on paper. A cancelled row is a well, and it carries its status
and no tags, which is what keeps every highlighter above the contrast threshold; see the
second decision in the accessibility document.

### Sky

Reads the campus hour, chooses the sky, paints the band, drifts it, crossfades at the hour
boundaries, and stops under reduced motion. It exposes the current sky's name so the
greeting can say "dusk over ECEB". It is the only component that knows what time it is.

### Numeral

A large condensed number with a small unit after it, as in `.greet .line b` and
`.tspec .num`: the number at condensed 800, the unit in Plex Sans at 15 px on the same
baseline.

### Icon (`svg.i`)

The eleven shapes the reference render draws: pin, calendar, arrow, back, bolt, share,
sun, moon, the two direction chevrons, previous and next, and the heart in the footer's
sign off. Arrow and back are a shaft with a
head and mean go to somewhere. The chevrons are a step one along, which is what a calendar
paging a week at a time is doing, and they are drawn on the chamfer's own 45 degrees so
that a direction belongs to the same geometry as every cut on the page. They take the stroke weight of the traces in the mark and the color of whatever
text they sit in. The first version of the site used emoji, which draw differently on every
platform, so the page had one face on a phone and another on the lobby screen. Adding a
shape means adding it to the reference render first.

An icon never appears without a label. Where a label already sits beside it in the
interface the icon is decoration and says so, which is the common case. The dial is the one
place an icon carries its own name.

### Mark

The mark, drawn rather than loaded as an image. It is never recolored, outlined, rotated or
placed inside a container, and the one variation it takes is white, on the kiosk and on the
night sky, where its own teal would disappear. An image cannot be given that white, which
is why the mark is inline. Its teal is the `--mark` token.

## Buttons (`.btn`)

Set in the display face at width 85, weight 700, 15 px, padding 11 px 18 px 11 px 16 px, no
radius, cut at the top right.

| Variant | Appearance |
| --- | --- |
| primary (`.primary.cut`) | the Current gradient fill, primary foreground text, cut 10 px |
| secondary (`.secondary.cut`) | ink border layer 1.5 px, paper or card fill, ink text, cut 10 px |
| quiet (`.quiet`) | no fill, primary text, a filled primary pad before the label, 10 px gap |
| danger (`.danger.cut`) | danger border layer 1.5 px, paper fill, danger text, cut; never filled until confirmed |
| small (`.sm`) | 13.5 px, padding 8 px 14 px 8 px 12 px, cut 8 px |

Focus: the border layer becomes 3 px of primary on the cut variants; a 2 px primary
outline 4 px out on the quiet variant. One primary per screen.

## Field (`.fld`)

A label in the display face at width 80, weight 700, 14 px; then a line: a pad, the input,
and a 2 px bottom border in strong line color; then help text at 12.5 px muted.

| State | Line | Pad | Help |
| --- | --- | --- | --- |
| rest | strong line | strong line | muted |
| focus (`.focus`) | primary, plus a 2 px primary shadow | primary, with a 4 px halo | muted |
| error (`.err`) | danger | danger | danger |

There is no box around a field.

## Calendar (`.cal`)

One month of days, and the part every date control on the site is built from. The date
field's floating sheet and the picker that takes a set of dates are both arrangements of
this one component, so a change to how a month is drawn is one change rather than two.

| Part | Appearance |
| --- | --- |
| month header (`.mhead`) | the previous chevron, the month and year in the display face at width 80 weight 700 15 px, the next chevron |
| stepper (`.mstep`) | a chevron in muted ink inside a 32 px target, ink on hover, a 2 px primary outline on focus |
| weekday cap (`.dcap`) | the two letter day in mono at 12 px muted, spelled out in full for a screen reader |
| week (`.wkrow`) | seven equal columns, 4 px gap |
| day (`.dbtn`) | the date in the display face at width 75 weight 700 16 px, with the pad under it, inside a 40 px target |

| State | Appearance |
| --- | --- |
| rest | ink, the pad hidden |
| chosen (`aria-pressed`) | the number in primary, the pad shown in primary |
| today (`.now`) | the number in the signal color, as it is on the term calendar |
| hover or focus | the number in primary |
| out of range (`disabled`) | muted ink held back to 50 percent |

The pad occupies its space whether or not the day is chosen, so a month does not change
height as it is clicked through. The chosen state is the pad because the pad is what says
chosen everywhere else on the site, and a filled rectangle behind a date is a shape the
design does not use.

A month is a grid and is walked with the arrow keys. One day of the month is in the tab
order, the day already chosen or today or the first day the calendar will accept, and the
arrows move from there: left and right by a day, up and down by a week, home and end to the
ends of the week, page up and page down by a month and with shift by a year. Walking off
the end of a month moves to the next one. A move that would land outside the range the
calendar was given stays where it is, so the focus is never left on a day that is going to
be refused. Forty two day buttons in the tab order is not keyboard support.

The calendar reports and decides nothing. Which month is on view and which days are marked
are given to it, and a click or a walk off the end says so and waits, which is what lets one
calendar serve a control that takes one date and a control that takes a set of them.

Whatever the control puts under the month, the count of dates chosen (`.tally`) or the
words that clear a field, sits inside the calendar so that it takes the calendar's own width.

## Date picker

The date field is the field above with a button on its line in place of an input, because a
date here is chosen on a calendar and never typed: a pad, the date in words, and the
calendar icon. Opening it lights the line exactly as focus does. The calendar drops out of
it on a floating sheet, cut 14 px at the top right, on the card color. Choosing a day closes
the sheet and hands the focus back to the field, and so does the escape key and a click
anywhere else. Paging the month leaves it open, because paging is not choosing.

## Switch (`.tswitch`)

A 54 by 22 px control: a 2 px track and a 12 px pad. Off: the track is strong line, the pad
is faint at the left. On: the track is the Current gradient, the pad is primary at the
right. The pad slides over 200 ms.

The state is in where the pad is and in what the control reports, as well as in the color of
the track, because meaning never rides on color alone. It answers the space bar and the
enter key.

## Dial (`.dial`)

The theme control. A pill with a 1.5 px outline in strong line color, holding a sun icon, a
pad, the current mode's name in the display face at width 80 weight 700, and a moon icon.
The pad sits beside the active mode and slides when the mode changes.

## Toast (`.toast`)

An ink slab with paper text, 12 px 18 px 12 px 14 px padding, cut 10 px at the top right,
floating shadow, a breathing pad at the left (signal for an event going live, primary for a
link made). The first words are bold in the display face. It stays for six seconds or until
dismissed, and is announced to assistive technology as a status.

## Empty state (`.empty`)

The dusk sky as a surface, cut 22 px, with a condensed 800 line at 30 px and a sentence in
secondary ink that says what is nearby and what to do.

## Agenda parts

### Day group (`.day`)

A two column grid, 150 px and the rest, 26 px gap. The left column holds the day name at
34 px condensed 800, the date in mono at 12 px muted, and a hollow pad (filled and
breathing in signal for today). Today's name is signal text.

### Event row (`.ev`)

A three column grid, 104 px, the rest, and auto, 18 px gap, padding 16 px 20 px 16 px 18 px,
cut 14 px, lamp from the top left. Rows are 6 px apart and settle on load.

- Time column: hour and minute at 34 px condensed 800, meridiem at 13 px, end time in mono
  at 12 px muted under it.
- Body: title at 19 px width 90 weight 700; a line with the organization (filled pad and
  the name in the adapted text color at weight 600) and the room (pin icon and mono at
  12.5 px); a description at 13.5 px muted up to 58 characters wide; a row of highlights.
- Side: a status highlight, or the now tag (breathing signal pad and "Happening now" in the
  display face at 13.5 px, signal text).
- Live (`.now`): the lamp becomes signal at 20 percent.
- Cancelled (`.cancel`): well background, title struck through in muted, no description and
  no tags. The status highlight in the side column says it is cancelled.

## Event page parts

### Poster (`.poster`)

The organization's lamp from the top left at 900 by 520 px. A back link, the title at 84 px
condensed 800 with a 17 character measure, the organization line, then a two column block:
the date in the display face at width 80 weight 700 13 px muted over the start time at 56 px
condensed 800 with the end time small beside it; and the room in mono at 22 px over the
building name at 13 px muted. Then the tag highlights and the description.

The right column holds the actions with no box: a heading, a primary and a secondary
button; a heading, the link in mono, the QR code and three quiet buttons; and, for a board
member, a well colored panel cut at 14 px with the board's actions.

## Midterm parts

### Term ribbon (`.ribbon`)

One cell per week of the term, 4 px apart, 64 px tall, cut 10 px. The number of columns is
the `--weeks` custom property, because a term at Illinois runs about sixteen weeks and the
reference render draws nine. Each cell's background
warms from well toward signal with the number of exams in the week, and shows the count at
22 px condensed 800 and the week's date in mono. This week carries a breathing signal pad
at its top right. A cell with three or more exams shows its count in signal text.

### Exam row (`.exam`)

A five column grid: 150 px, the rest, 250 px, 130 px, 110 px, 20 px gap, 14 px vertical
padding, a hairline above. The course code at 32 px condensed 800 over the course title at
12.5 px muted; the exam name at width 90 weight 700; the date and time at 20 px condensed
700 over the duration in mono; the room in mono at 14 px; the status highlight.

## Kiosk parts

### Kiosk stage

The night sky as the whole screen, the circuit board drawn on a canvas at low opacity with
a few traces in signal, a signal glow at the lower left.

The mark leads the screen rather than signing it off. A lobby display is read from across a
room and from the top down, so what says whose screen this is belongs where the eye lands
rather than where it finishes, and the domain and the position in the rotation sit with it.
The clock, the date and the forecast stack in the opposite corner. The foot the mark used to
sit in is gone.

Everything is a step or two larger than the reading pages, because the distance is the
room rather than a desk: the clock at 76 px condensed 200, the date under it at 26 px in
the display face, the organization at 26 px, the title at 96 px condensed 800 with an 11
character measure, the hours at 66 px condensed 800, and the room in mono at 32 px. The
day of the event keeps its word and gains the date beside it, set smaller and quieter, so
the figures settle what "Tomorrow" means to somebody reading at an unknown hour.

The forecast is three days from the platform's own weather service, and it is left off the
slide entirely when no source answered: a screen with an empty weather panel looks broken
and one with no panel looks finished.

Every slide carries a code to its own event page, in the corner the composition leaves
empty. It is drawn from the module matrix rather than dropped in as an image, so it takes
the chamfer the rest of the page takes, and the chamfer comes out of the tile's corner
rather than out of the code so that nothing a reader needs is clipped. Its two colors are
fixed rather than drawn from tokens, which is the one place on the site that is true: a
camera in whatever light a lobby has needs dark modules on a light field, and tokens would
invert it with the theme.

Every word on this surface is read once, by somebody walking past, so the screen lifts its
own two greys past the values the reading pages use. The faint gray stays what the color
document says it is, a hairline and a hollow pad, and no word on the screen is set in it.

At 820 px of height and below, which is what a 1280 by 720 or a 1366 by 768 display gives,
the sizes and the paddings step down one rung and the rail narrows to 340 px. The stage is
the whole viewport and its main column clips, so without that step the hours and the room
run off the bottom edge. Nothing new is introduced and nothing changes shape.

### Kiosk rail

A 440 px column on a darker translucent ground, 340 px on a screen 820 px high or less: a
heading at 20 px condensed 800, then items with the time at 26 px condensed 700 in teal 200
over a mono qualifier at 13 px, and the title at width 90 weight 700 over the organization
and room. A second heading and list
for this month's midterms sit at the bottom.
