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
Outlook or Apple Calendar. The panel is on the RSO dashboard for events and on the admin
Midterms tab for midterms.

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
