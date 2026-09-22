# Handoff

**Delete this file once you have read it.** It exists only to carry context from one
session to the next, it is not documentation, and it goes stale quickly. Read it, act on
anything still outstanding, then `git rm HANDOFF.md` and commit that removal with whatever
else you are pushing. Everything here that turns out to be durable belongs in `VISION.md`,
in `docs/`, or in a comment beside the code it describes, so move it there rather than
leaving this file in place.

Written at the end of the session that merged the Discord features, the data retention
pass and the reserved room fix.

## The release is half deployed, and this branch holds the fix

`v0.8.0` was cut and deployed, and it carried `deploy/bot-release` at `v0.1.0`. The
cutover reads that pin from inside the release tag and checks the named tag out in the
sibling bot checkout, so it built the bot image from `v0.1.0`. Production is currently
running the new website beside the old bot.

That combination degrades quietly rather than failing. The web platform writes the
`guild.unbound` and `optin.changed` outbox kinds that only the newer bot handles, and the
older bot skips kinds it does not know, so a board disconnecting a Discord server on the
website is never disconnected in Discord, and a follow or a reminder chosen on the website
is recorded and never applied. The older bot also never reports a binding, so
`Rso_Discord_Guilds` stays empty and every dashboard offers to add a bot that is already
installed. Everything that lives only in the web platform is fine: migration 0021, the
retention pipeline and the reserved room fix are all live and behaving.

Commit `a4acf79` on this branch repoints the pin to `v0.2.0`, which is the tag the bot
repository cut. No pull request has been opened for it. To finish:

1. Open a pull request for this branch into `main`, let the gate pass, and merge it.
2. `scripts/bump-version.sh patch` on `main`, which gives `v0.8.1`. A patch rather than a
   minor, because the change is a deploy pin and no code.
3. `git push && git push origin v0.8.1`.
4. `scripts/cutover.sh v0.8.1` on the VPS. The log should report that it checked out
   `v0.2.0` in the bot checkout. If it names `v0.1.0` again, the pin did not reach `main`.
5. `curl -fsS http://localhost:3000/health` and confirm the version is `v0.8.1`.

Released versions as of writing: web platform `v0.8.0`, bot `v0.2.0`, pin on `main` still
`v0.1.0`.

## The database tests cannot run in the agent environment

Pulling `mysql:8.0` is refused by the agent proxy, so `npm run test:db` and the whole `db`
vitest project only ever run in CI. Do not spend time trying to repair Docker for this. The
consequence worth knowing is that anything you write under `server/tests/db/` is unverified
until the gate runs it on a pull request, so prefer a unit test with a mocked pool where
the behaviour allows one. `server/tests/services/facilityArchive.test.js` is the example
written for exactly that reason, and it covers the archive cutoff, the advisory lock, the
lock release and the row ceiling without a database.

## The gate does not notice a stale bot pin

`scripts/tests/botRelease.test.js` checks that `deploy/bot-release` names one tag on one
line and ends with a newline. Nothing checks that the tag it names is the current bot
release, which is why `v0.8.0` shipped pointing at an old bot and passed every job on the
way through. A test comparing the pin against the newest tag in the bot repository would
close this, and it is worth writing before the next paired release.

## Four defects found and deliberately left

None of these are recorded anywhere else.

**Editing an event into a reserved room through Discord reports nothing.** The internal
edit endpoint answers with the event rather than with the controller's body, so the
`reserved` field the controller returns never reaches the bot. The website and the Discord
repeat flow both report it correctly.

**The `Dockerfile.server` copy of the update pages has no test behind it.** The path
arithmetic resolves to `/app/client/src/content/updates` and was checked by hand, but
nothing exercises a real image build. If that `COPY` were dropped, every genuine update
page would silently become `noindex`.

**Following every organization does not round trip.** Somebody who used the follow all
command in Discord sees no organizations marked on the website, because following
everything is a preference rather than a list and the website has no control for it.

**The Ad Astra poller passes `event_name` through raw.** Every other field it reads goes
through `optional()`, which caps the value at the width of its column. The event name goes
straight into a `varchar(500)`, and MySQL refuses a wider value rather than trimming it,
so an unexpectedly long title loses the whole booking. This predates the retention work.

## Branch housekeeping

The work reached `main` through `max-bromberg/viaillinois#16` and
`max-bromberg/viaillinois-bot#3`, both merged. Two earlier pull requests are still open and
entirely superseded by those: `max-bromberg/viaillinois#15` and
`max-bromberg/viaillinois-bot#2`, both from the stale `claude/gifted-brown-b01ezy` branch,
which also still exists in both repositories. The owner was asked whether to close them and
has not answered, so leave them alone until asked.

## Where the reasoning already lives

Do not ask for this context, read it.

`VISION.md` is the guiding document for this branch and holds the whole direction: what
VIA collects, reconciles, interprets and serves, the seven verified facts about the
codebase that the plan depends on, why retention is the only part of the work with a
deadline, the questions the platform should be able to answer, and the two decisions it
deliberately leaves open, which are that classification has no labels to train against yet
and that collecting behavioural data about identified people is a change in posture needing
an explicit decision and a privacy page.

Every design choice in the retention work is written beside the code that implements it.
`server/db/migrations/0021_facilities_retention.sql` covers the split between the working
set and history, why history normalises its text and the working set does not, the
dictionary column length and its collation, the storage arithmetic, the choice of two
indexes rather than four, and why `Events.created_at` is nullable and not backfilled.
`server/db/queries/facilityReservations.js` covers why the archive cutoff is the start of
the campus day rather than the present moment, why a run takes an advisory lock, and why
the copy and the delete are both held to the rows that existed when the run began.
