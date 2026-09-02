# Developing VIA

## Running it locally

The app needs a database. There are three, and they are not interchangeable.

| What | Where | Data |
| --- | --- | --- |
| Preview | `docker-compose.dev.yml`, port 3308 | A named volume, so it survives restarts |
| Tests | `docker-compose.test.yml`, port 3307 | In memory, wiped between runs |
| Production | The VPS, deployed by `scripts/cutover.sh` | Real user data, never touched from here |

Build the preview database once:

```bash
npm run dev:db
```

That writes `.env.dev` for you the first time, pointed at the preview container with the
credentials the compose file uses. Edit it afterwards only if you want Azure sign in
locally; the local username and password login works without it.

`npm run dev:db` starts the container, waits until MySQL genuinely accepts a connection,
applies the migrations, and loads two sets of rows: `seedDevFixtures.js` puts in a handful
of real buildings and courses, and `seed.js` hangs demo events, RSVPs and midterms off
them. `npm run dev:db:reset` throws the whole thing away and builds it again, which is the
right move whenever the data gets confusing.

Then run the app against it:

```bash
npm run dev:local
```

The client is on `http://localhost:5173` and the server on `http://localhost:3001`.

`npm run dev` is the older script and reads `.env` rather than `.env.dev`. Check where your
`.env` points before using it, because it has historically pointed at a remote host.

## The pollers

The three pollers scrape Course Explorer and Ad Astra as soon as the server boots. A
preview instance has no business sending that traffic to the university, so the generated
`.env.dev` sets `POLLERS_ENABLED=false`. Anything other than `false` or `0` leaves them on, so a
misspelled value cannot quietly stop ingestion in production.

Turn them on deliberately when you are working on ingestion itself.

## Tests

```bash
cd server && npm test          # fast tests, no database
cd server && npm run test:db   # database backed tests, starts its own container
cd client && npm test          # component tests
npx vitest run scripts/tests/  # release and compose file tests
npm run check:language         # em dash and en dash check
```

The database suites manage the test container themselves. They will not touch the preview
database, and neither should you: it is on a different port with a different name.

## Importing a calendar

Events and midterms can be imported from an .ics file exported from Google Calendar,
Outlook or Apple Calendar. The panel for events is on the RSO dashboard, and the one for
midterms is on the midterm schedule at `/midterms` and on the admin Midterms tab.

An event import needs board or editor access to the RSO it writes to. A midterm import
writes the shared exam schedule, so it is held to the same bar as deleting from it: a
global admin, or anyone who sits on an RSO board, decided by `checkAnyRsoBoard`. It was
previously open to global admins alone, which left the boards who read that schedule
unable to load it. An ordinary member cannot import, and neither can an editor, whose
remit is that RSO's own events.

The file is read in the browser and its text is posted to `POST /api/v1/events/import` or
`POST /api/v1/midterms/import`. With `preview: true` nothing is written and the plan comes
back to be looked at first. Importing the same file again updates what the first import
created, matched on each entry's `UID`, which is stored as `external_uid`. Rows entered by
hand have no `external_uid` and are never touched by an import.

Two behaviours are worth knowing because they are deliberate rather than incidental.

A location is only claimed as a known room when the text names both a building and a room
number. `ECEB 1002` resolves; a bare `1002` does not, because it is a room in eight
buildings; `Illini Union` does not, because it does not say where in the building. Anything
unresolved is kept as free text. A wrong room misdirects everyone who reads the listing,
whereas free text is merely less precise.

Repeating entries are imported as their first occurrence only. `RRULE` is not expanded,
because doing it correctly needs the whole timezone and exception machinery, and no
calendar imported so far uses it.

A midterm can be deleted outright, which is a different act from cancelling it.
Cancelling keeps the row and is right for an exam that was scheduled and then called off.
Deleting is for an entry that should never have been listed.

Deleting is open to global admins and to anyone who sits on an RSO board, the same bar as
importing. The midterm schedule belongs to no single RSO, so there is no RSO to be on the
board of for a given exam, and `checkAnyRsoBoard` in `server/middleware/auth.js` asks only
whether the person sits on a board at all. Boards are the people who schedule around this
listing, and so the people who notice what is wrong with it. An ordinary member cannot
delete, and neither can an editor, whose remit is that RSO's own events.

That decides where the control lives. Global admins delete from the admin Midterms tab,
which also reaches past exams. Board members cannot open the admin page at all, so for
them the control is on the midterm schedule itself at `/midterms`, and it reaches the
exams that listing shows, which are the ones that have not finished before today.

One consequence is worth knowing: a deleted midterm that came from a calendar is
recreated by the next import of that calendar, because the import matches on
`external_uid` and finds nothing. Cancelling is how to keep one of those off the page for
good, and the admin page says so at the point of deleting.

## Repeating events

Most of what an RSO holds repeats, so an event can be created as a series. The rule lives
in `Event_Series` and every occurrence is an ordinary `Events` row carrying `series_id`.
Nothing that reads events has to know about recurrence: the feed, the calendar, the kiosk,
room conflict detection, the sitemap and the structured data all keep working, because
what they see is still events. The spec is
`docs/superpowers/specs/recurring-events.md`.

Three things create a series. `POST /api/v1/events/series` takes an event and a
recurrence, which is what the event form sends. A calendar file with an `RRULE` on an
entry is expanded by the importer. And a scheduler search carrying a `recurrence` looks
for a slot that works every week, with the accepted recommendation creating the series.

The term comes from `server/lib/academicCalendar.js`. It derives each term from the shape
the university calendar has every year and lets a maintainer pin a term to its published
dates in `TERM_DATES`, which is one entry a year. The derived dates are close and are not
authoritative, so every screen that uses one shows it and lets the organizer change it.
`GET /api/v1/semester/current` serves the same answer to the form, the scheduler and the
importer, so all three agree.

Turning a rule into dates is `server/lib/recurrence.js`. It works in campus wall clock
throughout, which is why six in the evening stays six in the evening across the day the
clocks change, and it stops at two hundred occurrences, which is the backstop for a
calendar rule with no end. A repeat set up on the form skips the break weeks; one imported
from a file does not, because the file is the organizer's own calendar and it says which
dates exist.

`PUT` and `DELETE` on an event take `?scope=one|following|all`. An occurrence edited on
its own is marked `detached`, and a later edit to the whole series leaves it alone, so the
week that moved to another room stays moved. An event with no series has only itself, so
every scope means the same thing there.

## Time

VIA serves one campus, so every time it shows is that campus's time,
`America/Chicago`. A reader in another timezone is shown the hour the event
starts in Champaign, because that is the hour they would have to turn up at.

Times are stored as wall clock in `datetime` columns, with no zone, because that
is what the organizer typed. That is only half an answer, and the missing half
is where the times on the site used to disagree with each other. The rules that
close it are these.

The connection pool sets `dateStrings`, so a stored time is read back as the
string it is. Without it the driver parses each one into a `Date` using the zone
the server process happens to run in, and JSON then publishes it as UTC, which
moves every event by the difference between the two.

The campus clock lives in `server/lib/timezone.js`. `campusNow` and
`campusStartOfToday` give the present as campus wall clock, and no query uses
MySQL's `NOW()` to compare against a stored time. `NOW()` is the database
container's clock, and comparing it against a campus wall clock is out by five
or six hours, which is what decided whether a midterm read as upcoming or past.

Every JSON response goes through `server/middleware/campusTime.js`, which stamps
the campus offset onto each time on the way out. A published time therefore names
one instant, and a reader anywhere resolves it to the same one. It is mounted once
in `app.js` rather than per route, because a route that forgot was the original
inconsistency. Dates with no time of day are left alone: a date names a day, and
giving it an offset would shift it by one for half the readers.

The client renders with `client/src/lib/campusTime.js` and never with the
browser's own zone. `campusDate`, `campusTime` and `campusDateTime` format;
`campusFields` gives the campus clock fields that the week grid positions by;
`toDateTimeLocal` fills a `datetime-local` input with the wall clock the
organizer typed, so that saving an untouched form does not move the event.

A calendar column is a day rather than an instant, and the two are not
interchangeable. Columns are carried as a `Date` at local midnight so the
existing day arithmetic keeps working, and read back with `calendarDayKey`.
Use `fallsOnDay` to ask whether a time belongs in a column. Converting a column
through a timezone slides it to the day before for any reader west of UTC.

Both containers run on `TZ=America/Chicago`, set in `docker-compose.yml` and in
`Dockerfile.server`, so that a `CURRENT_TIMESTAMP` column default is written on
the same clock as everything beside it. Nothing above depends on that being set,
which is deliberate: the test suites pass under any `TZ`, and running them under
a few is the quickest way to catch a new reading of a time that has slipped back
to the local zone.
