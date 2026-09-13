# 06 Shape, space and motion

## The cut

The cut is a 45 degree chamfer on one corner. It is drawn with a clip path, never with a
border image or an SVG.

Top right cut, the common case (`.cut` in the reference stylesheet):

```css
clip-path: polygon(0 0, calc(100% - var(--cut)) 0, 100% var(--cut), 100% 100%, 0 100%);
```

Bottom left cut, for the sky band and the masthead (`.cutbl`):

```css
clip-path: polygon(0 0, 100% 0, 100% 100%, var(--cut) 100%, 0 calc(100% - var(--cut)));
```

| Where | Corner | Size |
| --- | --- | --- |
| primary and outlined buttons | top right | 10 px; 8 px for the small size |
| toast | top right | 10 px |
| event row | top right | 14 px |
| board panel on the event page, the empty state | top right | 14 to 22 px |
| week cells in the term ribbon | top right | 10 px |
| sky tiles | top right | 24 px |
| sky band | bottom left | 44 px |
| masthead of the reference page | bottom left | 56 px |

### A cut with a border

A clipped box loses its border along the diagonal, so an outlined cut shape is two layers.
The element itself is the border color, clipped to the outer chamfer. A pseudo element is
the fill, clipped to the same chamfer inset by the border width `w` on every edge; along the
diagonal each intercept moves by `0.414 w`. From the reference stylesheet:

```css
.btn.secondary.cut { position: relative; isolation: isolate; --w: 1.5px; --c: var(--cut, 10px);
  background: var(--ink); clip-path: polygon(0 0, calc(100% - var(--c)) 0, 100% var(--c), 100% 100%, 0 100%); }
.btn.secondary.cut::before { content: ""; position: absolute; inset: 0; z-index: -1; background: var(--paper);
  clip-path: polygon(var(--w) var(--w), calc(100% - var(--c) - var(--w) * .414) var(--w),
    calc(100% - var(--w)) calc(var(--c) + var(--w) * .414), calc(100% - var(--w)) calc(100% - var(--w)), var(--w) calc(100% - var(--w))); }
```

On keyboard focus `--w` becomes 3 px and the outer layer becomes the primary color, which
gives the focus ring the button's own shape. The primary button uses the same structure
with `--w: 0` at rest, so its focus ring appears the same way.

## Radii

The cut replaces most radii. Where a radius remains:

| Element | Radius |
| --- | --- |
| the pad | 2.5 px on a 10 to 12 px square |
| the dial | full pill |
| the highlighter stroke | 2 px |
| the switch track | 2 px |
| the toast, the event row, buttons | none; they are cut |

## Spacing

Every gap, padding and margin is one of 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32,
36, 40, 44, 48, 56, 64 pixels. The values used most:

| Place | Value |
| --- | --- |
| inside a row: horizontal padding | 18 left, 20 right |
| inside a row: vertical padding | 16 |
| between rows | 6 |
| row grid: time column, gap | 104 px column, 18 px gap |
| agenda: day column, gap | 150 px column, 26 px gap |
| between days | 18 above, 10 below |
| page gutters | 28 px inside a mock, 32 px at the page edge on desktop, 16 on a phone |
| filter rail width, gap to the agenda | 200 px, 36 px |
| sky band: navigation height | 64 px |
| sky band: greeting padding | 26 px top, 28 px sides, 34 px below the band's content |

## Elevation

Three levels and no more.

| Level | Treatment | Where |
| --- | --- | --- |
| resting | none; surfaces are told apart by the lamp and by paper against card | rows, panels, the rail |
| raised | the lamp brightens | a row on hover or focus within |
| floating | `0 2px 6px rgba(11,26,27,.06), 0 18px 48px -12px rgba(11,26,27,.22)` (dark: `0 2px 6px rgba(0,0,0,.5), 0 20px 48px -12px rgba(0,0,0,.7)`) | menus, popovers, the date picker, toasts, the whole reference mock |

There is no hairline border on a row, a panel or a button at rest, with two exceptions:
the outlined button's border layer, and the dial's 1.5 px outline.

## Motion

Five movements. Each is tied to a fact about the page. Everything else holds still, and all
five stop under `prefers-reduced-motion: reduce`.

| Movement | What it tells you | Specification |
| --- | --- | --- |
| the now pad breathes | this is happening right now | `box-shadow` from a 3 px halo at 24 percent to an 8 px halo at 0 percent and back, 1.6 s, ease in out, infinite; the day pad for today uses 2 s |
| the sky drifts | the page is alive at this hour | `background-position` from 0 0 to 0 100 percent over a background three times the band's height, 8 s, ease in out, alternate, infinite |
| rows settle | the agenda has just arrived | `translateY(8px)` to 0, 0.6 s ease out, each row 60 ms after the one above, never from invisible |
| the lamp brightens | you are reaching for this row | lamp strength from rest to hover over 200 ms |
| the dial turns | the theme is changing | the pad slides along the dial and the sky crossfades over 400 ms |

Nothing fades in from transparent. Nothing slides in from off screen. Nothing loops except
the two above that loop.
