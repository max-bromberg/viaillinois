# 10 Voice

The site speaks like a friend who works in the building and knows what time it is.

## How it sounds

- It greets. "Good evening, Illinois." "Good morning, Max."
- It tells you the number and what it means in one breath. "Two events in ECEB tonight,
  twelve this week, and the first midterm of the term is nine days out."
- It says what happened. "Your event is on the feed." "Linked. Discord will hear from us
  now."
- It says what to do next when there is nothing here. "Nothing on tonight. Thursday has two
  events and Friday has the Texas Instruments session. If you expected more here, clear a
  tag or two."
- It thanks people for the work they do for each other. "Kept by students and confirmed by
  course staff. If yours is missing, add it and the next person will thank you."
- It signs off from the building. "Made in ECEB, for everyone who walks past the lobby
  screen."

## How it does not sound

- It does not apologize. "Something went wrong" becomes "The feed did not load. Try again
  in a moment."
- It does not exclaim. No exclamation marks in interface copy.
- It does not use jargon a first year would not know. "RSO" is written "organization" in
  running copy; the abbreviation appears only where the platform's data already uses it.
- It does not label. There are no eyebrow captions, no "Section:", no "Status:" before a
  status.
- It does not shout. Uppercase is never used for emphasis.

## Names of things

Use the names the codebase already uses, in full. The event feed, the calendar, the midterm
schedule, the kiosk, the logistics dashboard, the scheduler, the poster designer, the
internal service API, the Discord companion. Do not coin a shortened name for any of them.

## Language rules

These apply to every string a person can read: interface copy, error messages, emails,
page titles, seeded content, and every document in this directory. The release gate
enforces the first.

- No em dashes and no en dashes. Use a comma, a colon, parentheses, or a full stop.
- No sentence fragments for emphasis, and no "it's not this, it's that" construction.
  Write complete sentences.
- No invented abbreviations or names.

## Buttons and controls

A control says exactly what happens: "Schedule an event", "Add a midterm", "Copy link",
"Download .ics", "Cancel event". After it happens the toast says it did, in the past tense
or as a fact: "On the feed." "Link copied."

## Times and places

- Times are "6:00 PM", with a space before the meridiem. Ranges are "6:00 to 8:00 PM" when
  both are in the same half of the day and "11:30 AM to 1:00 PM" when they are not.
- Days are "Today", "Tomorrow", then the weekday name for the next five days, then "Thu
  Sep 17" beyond that.
- Rooms are the building code and the room number, "ECEB 1002", with the building's full
  name available on the event page.
- Course codes are "ECE 391" with a space.
