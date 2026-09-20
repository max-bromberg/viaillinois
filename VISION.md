# VISION

The guiding document for the `intelligence-rework` branch. It holds until this branch
merges back to `main`, and work on the branch is judged against it. Where this document
and a ticket disagree, this document is what was meant.

## What VIA is

VIA is a data platform. It collects data from many sources, processes it, uses its own
methods to extract value from it, and hands that value to every interested party at no
cost. The event feed, the calendar, the dashboard, the kiosk, the Discord bot: those are
surfaces. They are how the value is delivered, and they are not the value itself.

That distinction is the whole reason for this branch. Over the past few weeks the surfaces
have been built out hard. What has not been revisited since the platform was written is
the layer underneath: the data VIA collects, the methods it uses to extract value from
that data, and the value it tries to extract at all. Those three questions are what this
branch is about.

## The four things VIA does

Naming the layers separately is useful because it makes plain which of them barely exists.

**Collect.** Take in data from facilities, from the course timetable, from organizers, and
from what happens on the platform itself. This is where the largest gap is, and it is
covered in its own section below.

**Reconcile.** Turn several sources into one account of what is true. Two facilities
sources describe the same campus, sometimes the same booking, and often disagree about
when they noticed it. Deciding what is actually true, and how confident VIA is, is a
capability the platform does not currently have at all. Today the two sources are merged
by a unique key on room, start and end, with a bitwise union of the source column. That is
a collision rather than a reconciliation: the second source to arrive overwrites nothing
and contributes nothing, and the disagreement is discarded along with the chance to learn
from it.

**Interpret.** Work out what the reconciled data means. What kind of event is this. Is
this slot historically good for this audience. Is this room really the size the timetable
claims. Has something been scheduled that an organizer would want to know about. This is
where most of the value lives and where almost none of it has been extracted.

**Serve.** Put the answer in front of whoever needs it, through whichever surface suits
them. This is the layer VIA is strongest at, and it is the one that needs the least work
right now.

## What we found when we looked

The following are facts about the codebase as it stands at the head of this branch, not
impressions. They are written down because the plan depends on them.

**Completed reservations are destroyed, and always have been.**
`deleteExpiredReservations()` runs inside both pollers on every cycle
(`server/services/astraPoller.js`, `server/services/facilitiesPoller.js`). Any reservation
whose end time has passed is deleted within hours of the event happening. VIA has never
retained a single completed reservation. This is not a thin history. It is no history.

**Events do not record when they were created.** The `Events` table has `created_by`,
which is a NetID, and no creation timestamp. `updated_at` was added in migration 0018 and
every row that predates it took the moment the migration ran. So how far in advance an
organizer entered an event, which is one of the more interesting things VIA could know
about its own users, is not answerable for anything already in the database.

**Most of what the facilities poller receives is thrown away.** The Astra request asks for
eighteen fields and stores four. Discarded on every poll: the activity identifier and the
event identifier, which are the only stable identity a booking has; the activity type
code, which is how an exam is told apart from a class and from a student event; the parent
activity, which is how a booking is known to be part of a recurring series; the section
identifier; and the instructor name.

**A reservation has no identity.** The unique key is room, start time and end time, so a
booking that moves becomes a new row and the old one survives until it expires. Nothing
can observe that a booking changed, because from the table's point of view one booking
ended and a different one began.

**The `customer` field is collected and never read.** The Tableau source fills it. The
Astra source hardcodes it to an empty string. Nothing in the platform reads it. It is the
one field VIA already has that might name the organization behind a booking.

**Room capacity is present, wrong, and unused.** `max_capacity` is not nullable, so every
room has a number. The number is not one anybody measured, and it reads the same for very
nearly every room on campus, which is why it was removed from every screen. There is no
true capacity data anywhere in the platform.

**Nothing is proactive.** The three pollers run on timers and nothing else does. No job
re-examines an event that has already been scheduled when the world changes around it.

## The principle: retention is the only part with a deadline

Everything in the Interpret layer can be built in any order and at any time, and the data
will be waiting. Collection cannot be done retroactively. A reservation deleted four hours
after an exam finished is gone for good, and no future version of VIA, however clever, can
look at it.

So the first work on this branch is deliberately the least interesting work available:
keep what arrives, capture the fields that are currently dropped, give a booking a stable
identity so that a booking which moves is recognisably the same booking, and start
recording the timestamps that were never recorded. None of it changes anything a user can
see. It starts the clock on everything else, and everything else gets better the longer it
has been running.

Any proposal on this branch should be asked one question first: does it lose data that
cannot be recovered later. If it does, that part comes first, whatever else is more
appealing.

## What we want to be able to answer

These are the questions that motivate the work. They are written as questions rather than
as features because the feature is usually obvious once the answer exists, and because
several of them will turn out to be answerable in ways nobody has thought of yet.

**About a booking.** Which organization made this reservation, and is it the same thing as
an event somebody entered on VIA. How confident are we. When did each source first show
it, and how long did the second one take to agree.

**About a slot.** Has this day and hour historically drawn people for this kind of event
and this audience. What else is on. What is on soon afterwards that will compete for the
same attention. Is anything high impact scheduled against it.

**About a room.** How many people actually fit in it, as opposed to how many the timetable
claims. How heavily is it used, by whom, and at what times of the term.

**About a term.** What does the shape of campus look like across a semester, by room, by
building, and by week, and how does that shape change around finals, breaks and the first
weeks of term. When are the midterms, which the exam bookings can answer directly and
which would turn a crowdsourced table into a verified one.

**About VIA itself.** Where do organizers give up. What advice did VIA give, and did the
events that took it do better than the events that did not. That last question is the one
that turns the platform from a thing with opinions into a thing that can be shown to be
right or wrong, and it is worth building toward deliberately.

## Who the intelligence is for

Any interested party. Today VIA has surfaces for organization board members and for the
general student population, and those are the two audiences the existing screens serve. A
student looking for somewhere to work, and a department wanting to understand how its
space is used, are equally valid readers of the same underlying answers.

Which surfaces get built, and when, is a later decision. None of them can be built at all
if the data is not there, which is why this branch starts underneath the surfaces rather
than beside them.

## What VIA is not

**VIA does not replace the reservation system.** Astra and Tableau describe what is
actually booked, and VIA observes them for ground truth. It reconciles against them, it
reasons about them, and it never asserts a booking of its own. That is expected to stay
true.

**VIA does not require a reservation.** Not every organization event has a booked room,
and some never will. Events without a room are first class and stay that way. A
reservation is a source to reconcile with where one exists, and its absence is not a
defect in the event.

**VIA does not guess silently about somebody's booking.** Where the platform believes a
reservation belongs to an organization, that belief is either confirmed by a person or
carried openly as an inference with a confidence attached. A wrong guess that nobody was
asked about is how one organization ends up holding another organization's room.

## Two decisions this document does not make

Both of these are real and neither should arrive as a side effect of other work.

**Classification has no labels yet.** Reliable classification of events underpins most of
the metrics described above, and there is currently nothing to train against or to check
against. The way out is already implied by the matching work: when a board confirms that a
reservation is theirs, that confirmation is a human verified label, and so is a rejection.
Matching is therefore not only the fix for organizers being refused their own bookings. It
is the pipeline that makes classification possible later, which is an argument for
building it early and for storing every confirmation and every correction, including the
ones where VIA was wrong.

**Behavioural data about identified people is a change in posture.** Recording that a
particular board member began creating an event and stopped is data about a person rather
than about a room. The platform is currently careful in a way that looks deliberate: no
address is stored in any column, and refusal counts are aggregated by the minute
specifically so that no per request row exists. Collecting abandonment signal is
defensible and the signal is real, and it deserves an explicit decision and a privacy page
that describes it, rather than appearing quietly under the heading of collecting
everything.

## How work on this branch is judged

1. Does it lose anything that cannot be recovered later. If so, fix that first.
2. Does it make VIA able to answer a question it could not answer before, or does it only
   rearrange an answer it already had.
3. Is the confidence honest. An inference presented as a fact is worse than no inference,
   particularly where somebody will act on it.
4. Does it still work for an event with no room, no reservation and no history.
5. Is it explainable to the organizer it affects. A number nobody can account for cannot
   be trusted and cannot be improved.
