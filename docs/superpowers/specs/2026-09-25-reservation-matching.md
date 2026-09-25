# Reservation matching

The first piece of the Reconcile layer described in `VISION.md`: deciding which
organization a room booking belongs to, and which event on VIA it is, with the
confidence stated openly and every human decision kept.

Status: proposed, for review before any code is written.

## Why this comes next

`VISION.md` asks two questions of every proposal. The first is whether it loses
anything that cannot be recovered later, and the work that answered that question
is done: migration 0021 keeps completed bookings, and migration 0022 records when
each source last showed a booking, so a cancelled or moved booking can be told apart
from one that went ahead. The second is whether the work lets VIA answer something
it could not answer before.

Matching answers the first question `VISION.md` lists about a booking: which
organization made this reservation, and is it the same thing as an event somebody
entered on VIA. It is also the only route to labels. Classification has nothing to
train or check against today, and a board confirming that a booking is theirs, or
saying that it is not, is a human verified label. Every later piece of the Interpret
layer that depends on knowing what a booking is starts here, which is the argument
for building it before anything that would be more visible.

## What VIA can see about a booking

These are the facts the matcher has to work with, as the facilities tables hold them
after migration 0022.

- **Where and when.** A room in `Locations`, and a start and an end.
- **A name.** `event_name`, from both sources, free text written by whoever booked it.
- **A customer.** `customer`, from Tableau only. It is the one field that might name
  the organization behind a booking. Ad Astra does not send it.
- **An identity.** `activity_id`, from Ad Astra only. `parent_activity_id` joins the
  meetings of one recurring series. A booking seen only by Tableau has neither.
- **A kind.** `activity_type`, from Ad Astra. The codes it uses have not yet been
  read out of real data, which is an open question below.
- **Sightings.** When each source first and last showed it.

And about VIA's side:

- `RSOs.name`, one name per organization. Almost every organization is also known by a
  shortened name, and a booking is usually titled with that ("IEEE General Meeting")
  rather than with the full name. VIA has no record of those today, so this work adds
  one, entered by each organization. See "Organization aliases" below.
- `Events`, each with an organization, an optional room and a start and an end. Many
  events have no room at all, and they stay first class.

## The identity of a booking

A match has to point at a booking in a way that survives the booking moving from the
working set into history, and that survives the booking itself moving.

A match therefore records the booking the way both tables already describe it, rather
than by `reservation_id` or `history_id`, each of which names a row in only one of the
two tables:

- `activity_id` when the booking has one. This is the identity that survives a move.
- `location_id`, `start_time` and `end_time` always. For a booking seen only by
  Tableau this is the only identity there is, and for any booking it records the slot
  the belief was formed about.

Finding the booking a match points at is then a lookup by `activity_id` where there is
one, and by the slot otherwise, in the working set first and in history after that.
Both tables index `activity_id` already. History deliberately has no index on location,
and the slot lookup there happens only offline, so it can seek by time and filter.

A recurring series is matched once rather than meeting by meeting. When the booking has
a `parent_activity_id`, the match records it, and a board confirming one meeting of a
series is asked whether the whole series is theirs. Tableau only rows have no series and
are matched one at a time.

## Tables

Two new tables in the web platform's database, written with Drizzle and introduced by
one migration.

### RSO_Aliases

The other names an organization goes by, entered by the organization itself.

| Column | Meaning |
| --- | --- |
| `alias_id` | Primary key. |
| `rso_id` | The organization. Cascades on delete, since an alias means nothing without it. |
| `alias` | The name as the organization typed it, trimmed, between two and forty characters. |
| `created_by` | The NetID that added it, set null if the account is removed. |
| `created_at` | When. |

A unique key on the organization and the alias, compared without case or accents, stops
one organization entering the same name twice. The same alias is allowed for two
organizations, because shortened names genuinely collide on a campus, and refusing the
second organization would be VIA deciding which of them owns a name. A booking matching
a shared alias is proposed to both, and the evidence says the name is shared. An
organization holds at most ten aliases.

VIA never writes an alias itself. It does not derive initials from a name or suggest a
shortening, because an alias VIA invented is exactly the silent guess `VISION.md` rules
out, and a wrong one would propose one organization's bookings to another.

### Reservation_Matches

One row per belief that a booking belongs to an organization.

| Column | Meaning |
| --- | --- |
| `match_id` | Primary key. |
| `activity_id`, `parent_activity_id` | The booking's Ad Astra identity, when it has one. |
| `location_id`, `start_time`, `end_time` | The slot the belief is about. No foreign key on the room, for the same reason history has none: the record has to outlive the room. |
| `scope` | `booking` or `series`. |
| `rso_id` | The organization VIA believes made the booking. |
| `event_id` | The event on VIA the booking is believed to be, when there is one. Set null if the event is deleted, because the label is still true. |
| `method` | Which signal produced the belief: `event_overlap`, `name`, `customer`, or `board` when a board claimed a booking VIA never proposed. |
| `evidence` | JSON holding the values the signal saw when it formed the belief, such as the booking name, the customer and the overlap. This is what the dashboard shows as the reason. |
| `confidence` | A number from zero to one, from the rules below. |
| `state` | `proposed`, `confirmed` or `rejected`. |
| `proposed_at` | When VIA formed the belief. |

A unique key on the booking identity and the organization keeps the matcher from
proposing the same thing twice. A booking can hold beliefs about more than one
organization at once, which is the honest shape when two organizations have similar
names.

### Reservation_Match_Decisions

Every decision a person made about a match, appended and never updated.

| Column | Meaning |
| --- | --- |
| `decision_id` | Primary key. |
| `match_id` | The match decided. Cascade on delete is deliberately absent, so a decision outlives the proposal it answered. |
| `decision` | `confirm` or `reject`. |
| `decided_by` | The NetID of the board member who decided, set null if the account is removed. |
| `decided_at` | When. |
| `surface` | `dashboard`, and later `discord`. |

`Reservation_Matches.state` is the latest decision, kept on the match so that readers
do not have to fold the log. The log is the record. A board that confirms and then
changes its mind leaves two rows, and both are labels: the first is a mistake a person
made, and the second is the correction. `VISION.md` asks for every correction to be
kept, including the ones where VIA was wrong, and this is that.

Recording who decided is data about a person acting as an officer of an organization,
of the same kind as `Events.created_by`. It is not the behavioural data `VISION.md`
sets aside for its own decision, because it records a deliberate act rather than
observing somebody. It is still written into the privacy page when the dashboard
control ships.

## Signals

The matcher starts with three signals, each explainable in one sentence to the
organizer it affects.

**Event overlap.** An event on VIA in the same room as the booking, overlapping it in
time, is a strong sign that the booking is that event and belongs to that event's
organization. Confidence rises with the share of the booking the event covers. This is
the signal behind the refusal fixed in 0.8.0, when VIA turned organizations away from
their own bookings.

**Name.** The booking's name contains an organization's name, or one of its aliases, as
a whole word, compared without case or accents. Whole words matter most for aliases,
which are usually a few capital letters: "ACM" has to match "ACM Meeting" and must not
match "ACME Robotics". The evidence records which name or alias matched, so the
dashboard can say so. A match from this signal alone never reaches the confidence the
event overlap signal does, and a match on an alias that another organization shares is
set lower again.

**Customer.** Tableau's `customer` field compared against organization names and aliases
in the same way. It is stronger than the booking name where it exists, because it names who
booked rather than what the booking is called.

Where more than one signal agrees about the same booking and organization, the match
records all of them in its evidence and takes the higher confidence rather than adding
them together, until there are labels to justify anything else.

### What the confidence is, and what it is not

The first confidences are fixed numbers chosen by hand for each signal. They order the
proposals and they decide which ones are shown. They are not probabilities, because
nothing has yet been measured against a label, and presenting them as percentages
would put an inference forward as a fact, which `VISION.md` forbids. The dashboard
therefore shows the reason from the evidence ("an event you entered is in this room at
this time", "the booking is called IEEE Soldering Night") and never a number.

Once enough decisions exist, the confirmation rate of each signal is measured against
them, and the confidences are replaced by what was measured. The decisions table is
built so that question has an answer.

## What is and is not matched

Only bookings that could plausibly belong to an organization are considered. A class
meeting or an exam cannot, and matching one to an organization with a similar name
would be a guess nobody should be asked about. That filtering depends on the Ad Astra
activity type codes, which are an open question below. Until they are known, the
matcher skips any booking that carries a `section_id` or an `instructor`, which a class
has and a student booking does not, and records what it skipped so the codes can be
read from real data.

Nothing that exists today changes because of a match. The reserved room check, the
free room search and the scheduler read the facilities tables exactly as they do now.
Using a confirmed match to tell a board "this reservation is yours" when they create an
event is the first use worth building on top of this, and it comes after the matches
exist.

An event with no room and no booking is untouched by all of this.

## When matching runs

A background job, like the pollers, on its own timer and after each facilities poll
completes. It reads the working set only, because a proposal is only useful while the
booking has not happened. Bookings that are already in history can be matched later by
an offline run, once the signals have proved themselves on live data.

The job writes proposals and nothing else. It never confirms, and it never changes a
match a person has decided. A booking that a board rejected for an organization is never
proposed to that organization again.

## Surfaces

**Organization settings.** An "Other names" field on the organization's settings,
beside the name and description a board already edits, where a board adds and removes
aliases. It is guarded like the rest of the organization's details, by
`requireRSOAdmin`, because an alias speaks for the whole organization in a way a single
event does not. The field says what the names are used for, in one sentence: VIA uses
them to recognise room bookings made under a shortened name. A global admin can remove
any alias, which is the remedy if an organization enters a name that plainly belongs to
another.

**Logistics Dashboard.** A short list headed "Bookings that may be yours", for anybody
who can create events for the organization, showing each proposed match with its room,
its time, the booking's name and the reason. Each has two controls, "This is ours" and
"Not ours". For a series, "This is ours" asks whether it means this meeting or every
meeting in the series. The list is empty for an organization VIA has nothing to propose
to, and says so.

**API.** Two routes under the existing organization routes, guarded the same way event
creation is:

- `GET /api/rsos/:id/booking-matches` lists proposed matches for the organization.
- `POST /api/rsos/:id/booking-matches/:matchId/decision` records `confirm` or `reject`,
  with the scope for a series.

**Discord.** Later, through the internal service API and the outbox, as the bot's other
proposals already work. The decisions table records the surface so the two can be
compared. Nothing in the bot changes in this work package.

## How this is judged against VISION.md

1. **Loses nothing.** Every proposal and every decision is kept, and a decision is
   never overwritten.
2. **Answers something new.** Which organization made a booking, and how sure VIA is.
3. **Honest confidence.** Hand set confidences order proposals and are never shown as
   numbers. Nothing becomes a fact until a person confirms it.
4. **Events with no room.** Untouched.
5. **Explainable.** Every proposal carries the evidence that produced it, and the
   dashboard shows that evidence as the reason.

## Decided

**Organizations enter their own aliases.** Almost every organization has a shortened
name, and the name signal is weak without them, so aliases are part of this work rather
than a later addition. They are entered by the organization and never generated by VIA.

**Who may decide a match.** Anybody who can create events for the organization: a
member with the Board or Editor role, or a global admin. That is the check
`checkRsoEditor` makes when an event is created, and `requireRSOEditor` is the route
guard built on the same check, so the two match routes use it. They are the people who
book rooms, so they are the people who know whether a booking is theirs.

## Open questions

1. **Ad Astra activity type codes.** Which codes mean a class, an exam and a student
   booking. This can be read from the working set once the retention work has been
   running for a while, and the first task of the plan is a query that reports it.
2. **The Tableau export's other columns.** The poller logs any column it does not
   read. If the export carries a reservation number or a contact, it would strengthen
   both the identity and the customer signal.
3. **Aliases elsewhere.** Search on the feed and the organizations page could find an
   organization by its alias as well. That is a natural later use and is not part of
   this work.
