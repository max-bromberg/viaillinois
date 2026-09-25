# Plan: reservation matching

Implements `docs/superpowers/specs/2026-09-25-reservation-matching.md`. Each step is
its own pull request to `main` and passes the gate before the next begins. Every task
starts with a failing test, run and seen to fail for the right reason.

Database tests do not run in the agent environment, so each step pairs its `db` tests
with unit tests over a mocked pool, as `server/tests/services/facilityArchive.test.js`
does, and the `db` tests are first run by the gate.

## Step 0: when each source last showed a booking (in review)

Migration 0022, the last sighting per source in the working set and in history, and the
span of dates each facilities poll covered in the poll log. Written before this plan
because it stops a loss, and it is the ground every later step stands on.

## Step 1: the tables

1. A `db` test that migrations create `RSO_Aliases`, `Reservation_Matches` and
   `Reservation_Match_Decisions` with the columns, keys and absent cascades the spec
   describes. Watch it fail.
2. Migration 0023 and the Drizzle declarations. The schema declaration test and the
   drift check cover the pairing.
3. `server/db/queries/reservationMatches.ts` in Drizzle: propose (safe to repeat, and
   never touching a decided match), list proposed matches for an organization, and
   decide (writing the decision and the state in one transaction). Unit tests over a
   mocked client for the rules, `db` tests for the real statements.
4. A test and a guard that a booking rejected for an organization is never proposed to
   it again.
5. `server/db/queries/rsoAliases.ts` in Drizzle: list, add and remove, refusing a
   duplicate within one organization, a length outside two to forty characters, and an
   eleventh alias.

## Step 1b: organizations enter their aliases

Its own pull request, so aliases start accumulating while the matcher is built.

1. Route tests for `GET`, `POST` and `DELETE` under `/api/rsos/:id/aliases`: the
   `requireRSOAdmin` guard, a global admin removing any alias, organization scoping,
   and every refusal from step 1.
2. The controller and routes.
3. The "Other names" field on the organization's settings, with client tests, and the
   sentence saying what the names are used for.
4. A changelog entry.

## Step 2: the matcher

1. A report of activity type codes, with counts and a sample of names for each, on the
   admin page behind `requireGlobalAdmin`, because manual SQL against production is
   ruled out. It answers the spec's first open question and decides the class filter.
2. The three signals as pure functions over a booking and the organizations, their
   aliases and the events near it, each returning a confidence and its evidence. Unit
   tested exhaustively, including short aliases against longer words ("ACM" against
   "ACME"), accents, an alias two organizations share, events with no room and bookings
   with no name.
3. `server/services/reservationMatcher.js`: read the working set, apply the filter and
   the signals, and write proposals. It runs on its own timer and after each facilities
   poll, and is started and stopped beside the pollers in `server/index.js`.
4. A log line per run saying how many bookings were considered, skipped and proposed,
   so the first weeks can be read before any board sees a proposal.

## Step 3: the dashboard

1. Route tests for the two API routes: the guard, the organization scoping (one
   organization can never see or decide another's matches), the series scope and the
   refusal of a decision on a match that is not proposed.
2. The controller and routes.
3. The "Bookings that may be yours" list on the Logistics Dashboard, with client tests,
   and the privacy page updated to say that a decision records who made it.
4. A changelog entry.

## Step 4: dropped bookings stop counting as occupied (separate, after data accumulates)

With 0022 live for a few weeks, a booking whose last sighting predates a clean poll
that covered its date can be recognised as dropped. The reserved room check and the
free room search stop counting those. This changes what users see, so it waits until
the poll log shows how often it happens and is its own pull request.

## Later: Discord

Proposals offered to a board in its Discord server through the internal service API
and the outbox, recorded with the `discord` surface. A paired release with the bot.
