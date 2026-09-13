# 04 Color

Every value below is a token. Nothing in the client carries a raw hex value outside the
token file.

## Teal scale

| Stop | Hex | Use |
| --- | --- | --- |
| 50 | `#e6f8f8` | soft primary fill, light theme |
| 100 | `#c3eeef` | |
| 200 | `#8fdfe1` | soft primary foreground, dark theme; the mark on the kiosk rail |
| 300 | `#52d0d5` | primary hover, dark theme |
| 400 | `#2fc4c8` | primary, dark theme (8.7 to 1 on the dark ground) |
| 500 | `#00aaaf` | the mark, display use only |
| 600 | `#008b8f` | |
| 700 | `#007c80` | primary, light theme (5.0 to 1 on white) |
| 800 | `#005558` | soft primary foreground, light theme |
| 900 | `#0a3334` | |
| 950 | `#0a1516` | dark theme ground |

## Neutrals

Every neutral carries a teal cast, so the page reads as one material.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| paper | `#f5fafa` | `#0a1516` | the page |
| card | `#ffffff` | `#111f20` | a row, a panel |
| well | `#ecf3f3` | `#0e1b1c` | an inset surface, a cancelled row |
| line | `#d3e2e2` | `#1f3334` | hairlines |
| line, strong | `#b4c9c9` | `#2d4647` | hairlines that must be seen, the switch track |
| ink | `#0b1a1b` | `#e6f0f0` | text |
| ink, secondary | `#2b3d3e` | `#c3d3d3` | text on a sky, ledes |
| muted | `#4d6667` | `#8fa8a8` | secondary text (5.8 and 7.4 to 1 on paper) |
| faint | `#7d9394` | `#5f7879` | hairlines and hollow pads only, never words |

## Primary, signal and status

| Token | Light | Dark |
| --- | --- | --- |
| primary | `#007c80` | `#2fc4c8` |
| primary foreground | `#ffffff` | `#04201f` |
| primary soft | `#e6f8f8` | `#0f2e2f` |
| primary soft foreground | `#005558` | `#8fdfe1` |
| signal | `#e84a27` | `#ff8a66` |
| signal text | `#c8391a` | `#ff8a66` |
| signal soft | `#fdeae4` | `#3a1b12` |
| ok | `#1f7a3c` | `#5fcf85` |
| warn | `#9a5b00` | `#e8b04a` |
| danger | `#c02a2a` | `#ff7676` |
| plum | `#6b3fa0` | `#b79aea` |

Status is never teal and never orange, with one exception: what is happening now uses the
signal color, because that is what the signal color is for.

## The eight hues

For tags, and for the calendar's kinds of entry. Matched in lightness so no tag shouts.
Each tag is assigned a hue by the platform when it is created, never by the person filing
an event.

| Name | Light | Dark |
| --- | --- | --- |
| teal | `#007c80` | `#2fc4c8` |
| orange | `#e84a27` | `#ff8a66` |
| plum | `#6b3fa0` | `#b79aea` |
| amber | `#b7791f` | `#e8b04a` |
| green | `#1f7a3c` | `#5fcf85` |
| blue | `#0b5fa5` | `#6fb2f0` |
| rose | `#b5306f` | `#f08ab8` |
| olive | `#5b6b12` | `#b7c85a` |

## The skies

Each sky is a vertical gradient that ends in paper. In the light theme the night sky
switches the band to light ink. In the dark theme every sky is a night variant tinted by
the hour.

| Hour | Light theme | Dark theme |
| --- | --- | --- |
| Morning, 6:00 to 11:00 | `#fff1d6` 0%, `#eaf6f4` 55%, paper | `#2a2416` 0%, `#12211f` 55%, ground |
| Afternoon, 11:00 to 17:00 | `#d8f3f3` 0%, `#edf8f8` 55%, paper | `#0f2e2f` 0%, `#0d2224` 55%, ground |
| Dusk, 17:00 to 21:00 | `#ffd2bb` 0%, `#fbe3d9` 30%, `#d9f1f1` 68%, paper | `#3a1b12` 0%, `#2a1712` 30%, `#0f2e2f` 68%, ground |
| Night, 21:00 to 6:00 | `#0f2224` 0%, `#1c3538` 45%, `#4b5f60` 80%, paper, light ink | `#05090a` 0%, `#0a1516` 45%, `#0f2224` 80%, ground |

The angle is 180 degrees. Between two hours the two skies crossfade over the last thirty
minutes of the earlier one. The band drifts by animating its background position over its
height on an eight second alternating ease, which reads as a slow breath rather than a
scroll. The sky is measured against both inks; see the accessibility document.

## The other gradients

| Name | Value | Home |
| --- | --- | --- |
| Current | `160deg, #0a9a9e 0%, #007c80 60%, #005558 100%` (dark: `#52d0d5`, `#2fc4c8`, `#0a9a9e`) | the primary button, the switch track when on, a checked pad, the active page marker in the rail |
| Board | `160deg, #0f2e2f 0%, #0a1516 55%, #1a1210 100%` | the kiosk under the night sky |

A gradient anywhere else is a defect.

## The lamp

The lamp is a radial gradient from the top left corner of a surface: 560 by 200 pixels on
an event row, 900 by 520 on the event page, fading to the surface color by 72 percent of
the width. Its strength is a mix of the organization's adapted lamp color into the surface:

| State | Light | Dark |
| --- | --- | --- |
| at rest | 14 percent | 22 percent |
| hover or focus within | 30 percent | 38 percent |
| the event page poster | 18 percent | 26 percent |

The transition between states takes 200 milliseconds.

## The highlighter

A word with a stroke under it. The stroke is the hue at 30 percent over the surface, 52
percent of the line height tall, sitting one pixel below the baseline, skewed minus 10
degrees on the horizontal and rotated minus 1.2 degrees. The text is a mix of 62 percent
hue and 38 percent ink, which clears 4.8 to 1 on its own stroke for the worst hue in both
themes. An unselected tag has no stroke, a dotted hairline under it, and muted text at
regular weight.

## Adapting an organization's color

Each organization chooses a color in its settings, usually the color of its own logo. That
color is stored exactly as given and is never shown exactly as given. Before it reaches the
page it is bent into VIA's range, so it fits the site everywhere while still saying which
organization it belongs to.

The adaptation works in the OKLCH color space, which keeps hue perceptually steady while
lightness and chroma move.

1. Convert the stored color to OKLCH.
2. Keep the hue.
3. If the chroma is below 0.02 the color is a gray; keep it gray. Otherwise clamp the
   chroma into the range for the role below, so neon calms down and dull colors get a
   little life.
4. Set the lightness to the value for the role and theme below.
5. Convert back to sRGB, reducing chroma in small steps if the result falls outside the
   gamut.

| Role | Light theme lightness | Dark theme lightness | Chroma range |
| --- | --- | --- | --- |
| mark (pad, calendar chip, switch) | 0.56 | 0.74 | 0.07 to 0.16 |
| text (the organization's name) | 0.42 | 0.80 | 0.06 to 0.14 |
| lamp | 0.62 | 0.68 | 0.07 to 0.16 |

With these values the organization's name on its own lamp clears 6.8 to 1 in the light
theme and 6.2 to 1 in the dark theme for every input tested, including pure black, pure
white, mid gray, neon yellow, lime, navy and cyan. The mark on paper clears 4.3 to 1 for
neon yellow, the hardest case, which is enough for a 12 pixel shape that is always beside a
name.

The adaptation is a pure function of the stored color, the role and the theme. It lives in
the client, it is unit tested against the inputs above, and the same function feeds the
event card, the filter rail, the calendar and the poster designer so that an organization is
the same color everywhere on the site.

Worked examples, given color to adapted mark and text in the light theme:

| Organization | Given | Mark | Text |
| --- | --- | --- | --- |
| IEEE | `#00629B` | `#297ab5` | `#015181` |
| HKN | `#8B1E3F` | `#b84964` | `#871f3e` |
| WECE | `#7C3AED` | `#7a5dc8` | `#523891` |
| Illini Solar Car | `#F59E0B` | `#a06604` | `#6c4302` |
| ECE Ambassadors | `#059669` | `#0e8961` | `#085c3f` |
