# 08 Surfaces

How each page is composed from the parts. Pages that were not mocked in the reference render
follow the same rules; where a page needs a part that does not exist yet, the part is added
to the component document first.

## The feed

The sky band holds the navigation, the greeting and the clock. The greeting is "Good
morning," "Good afternoon," or "Good evening," in wide 300 over the person's first name, or
"Illinois." when signed out, in condensed 800. Under it, one line of numerals: tonight's
count in signal, this week's count, and the days to the next midterm.

Below the band, on paper: a 200 px rail of words at the left (When, Search, Tags,
Organizations, Show), and the agenda at the right, grouped by day. Pagination continues to
serve eighteen events a page; the day grouping is applied within a page and a day may
continue across a page boundary, in which case its name repeats.

The rail has no panel. Its headings are condensed 800 at 16 px. Upcoming and Past are two
words with the active one underlined by a 3 px Current gradient. Tags are highlights.
Organizations are pads and names. The internal events control is a pad.

## The event page

A poster, as described in the component document. The board's tools appear only for a
signed in board member of that organization. The lamp uses the organization's adapted lamp
color at 18 percent.

## Midterms

The page title in condensed 800 at 56 px, "Midterms, Fall 2026", with the term name from
the platform. A sentence in Plex Sans. The search field and the primary button at the
right. The term ribbon. The exam listing. The add form opens in a dialog styled from the
same parts.

## The calendar

The month grid keeps its structure and takes the tokens. Day numbers are condensed 700 at
16 px. Today's number is signal. Entries are the organization's adapted mark color as a
2 px trace on the left of the entry's text, which is the one place a vertical color line
remains, because a calendar cell is too small for a lamp. Midterms use plum. The week view
follows the same rules. There is no legend of colored squares; the filter rail's pads and
names are the legend.

## The kiosk

The stage and the rail, as described in the component document. The rotation is eight
seconds per event and the crossfade between events is the settle movement applied to the
title block. The kiosk is always the night sky regardless of the hour, because the lobby
screen is the one place the board should be visible at full strength.

## The dashboard, the scheduler and the poster designer

These are board tools, and they follow the same rules with less ceremony: no sky band
(the navigation sits on paper), page titles in condensed 800 at 40 px, forms built from the
field, the switch and the pad, tables built like the exam listing, and one primary button
per screen. Recommendations in the scheduler are rows with a lamp in the organization's
color and a numeral for the score.

## About, updates, terms and privacy

Reading pages. The sky band with the page title in condensed 800 at 56 px in place of the
greeting, then prose in Plex Sans at a 62 character measure, with headings in condensed 800
at 30 px. Updates are listed as rows with the date in mono.

## Login and account

The sky band with "Sign in" as the greeting, one primary button for the NetID sign in and a
quiet button for the local fallback. The account page is a reading page with a field for
each setting and a switch for each preference. The Discord link state is a toast when it
changes and a filled pad with a sentence when it is shown.

## Empty, loading and error states

An empty list is the empty state component with a sentence about what is nearby. Loading
draws the shape of the rows in well color with no shimmer; the rows settle when they
arrive. An error is a sentence in danger text under the thing that failed, never a red box.
