# 05 Typography

## The faces

| Face | Axes shipped | Role |
| --- | --- | --- |
| Bricolage Grotesque | width 75 to 100, weight 200 to 800, optical size 12 to 96, one variable file | display: headlines, day names, times, counts, course codes, buttons, navigation, event titles, rail headings |
| IBM Plex Sans | weight 400, 500, 600 | reading: descriptions, help text, ledes, anything longer than a line |
| IBM Plex Mono | weight 400, 500 | data: rooms, course codes in tables, dates in the small, anything a person copies |

All three are open licensed and self hosted as Latin subsets. The build verifies that each
file's character map covers U+0020 through U+007E before it ships; see the implementation
document for why.

## The roles

Sizes are in pixels. Line height is unitless. Tracking is in em. The optical size axis is
set to 96 on every display role.

| Role | Face | Width | Weight | Size | Line | Tracking | Where |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Masthead name | Bricolage | 75 | 800 | 128 | 0.9 | +0.012 | the greeting's name on the design foundation page |
| Greeting name | Bricolage | 75 | 800 | 78 | 0.92 | +0.012 | the name in the sky band |
| Greeting lead | Bricolage | 100 | 300 | 30 | 1.05 | 0 | "Good evening," above the name |
| Poster title | Bricolage | 75 | 800 | 84 | 0.9 | +0.012 | the event page title, measure 17 characters |
| Kiosk title | Bricolage | 75 | 800 | 98 | 0.88 | +0.012 | the kiosk, measure 13 characters |
| Page title | Bricolage | 75 | 800 | 56 | 0.9 | +0.006 | the midterm page title |
| Clock | Bricolage | 75 | 200 | 64 | 1 | +0.006 | the time in the sky band; 54 on the kiosk |
| Day name | Bricolage | 75 | 800 | 34 | 0.95 | +0.006 | the agenda |
| Row time | Bricolage | 75 | 800 | 34 | 0.95 | +0.006 | the agenda; the meridiem at 13 at width 90 |
| Count | Bricolage | 75 | 800 | 30 | 1 | +0.006 | the numerals in the greeting line |
| Exam code | Bricolage | 75 | 800 | 32 | 1 | +0.006 | the midterm listing |
| Exam time | Bricolage | 75 | 700 | 20 | 1 | +0.006 | the midterm listing |
| Rail heading | Bricolage | 75 | 800 | 16 | 1.2 | 0 | the filter rail |
| Event title | Bricolage | 90 | 700 | 19 | 1.15 | 0 | the agenda |
| Button | Bricolage | 85 | 700 | 15 | 1.1 | 0 | every button; 13.5 for the small size |
| Navigation | Bricolage | 85 | 600 | 15.5 | 1.2 | 0 | links; the active page at 800 |
| Body | Plex Sans | | 400 | 15 | 1.55 | 0 | measure 58 to 62 characters |
| Small | Plex Sans | | 400 | 13.5 | 1.5 | 0 | descriptions in rows, help text |
| Data | Plex Mono | | 400 | 12.5 to 14 | 1.4 | 0 | rooms, course codes, dates |

Nothing is set below 12 pixels.

## Tracking

The condensed cut of Bricolage is tight by design, so no negative tracking is applied to it
anywhere. Large condensed 800 (masthead, greeting, poster and kiosk titles) takes plus
0.012. Mid size condensed numerals and names take plus 0.006. Wide 300 and the document
headings take zero.

## Setting numbers

- A count is a numeral followed by its meaning in words, in one phrase, never a tile.
- A time in the agenda is the hour and minute at row time size, the meridiem small beside
  it, and the end time in mono under it: "6:00 PM, to 8:00 PM".
- Digits in the display face are proportional, which is right for a headline. Digits in
  Plex Mono are tabular, which is right for a column.
- A course code is "ECE 391" with a space, in the display face when it is a headline and in
  Plex Mono when it is data.

## Pairing rules

- A condensed 800 headline is followed by wide 300 or by Plex Sans, never by another
  condensed 800 line at a different size.
- Bricolage is never used below 13.5 pixels. Below that, Plex Sans or Plex Mono.
- There is no italic anywhere except the site's full name in the navigation.
