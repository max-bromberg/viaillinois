# Deploying VIA

VIA runs on a single VPS: MySQL 8.0 in a container, the application container beside it,
and the Discord bot's container beside both, all managed by Docker Compose. Deploys go
through `scripts/cutover.sh` and nothing else. No manual `docker compose up` against
production, and no manual SQL against the production database. One cutover deploys the
website and the bot together, and "Deploying the Discord bot" below is the bot's half of
the procedure.

## Prerequisites on the host

- Docker with the Compose plugin
- Git, with the deployment checkout able to fetch tags
- `curl`
- A docker network named `internal`, created once with `docker network create internal`.
  The reverse proxy and the application both join it, and the proxy resolves the
  application by service name on it. `docker-compose.yml` declares the network as
  external, so compose attaches to the existing one rather than creating its own.
  The database does not join it. It sits on a second network that compose creates and
  that belongs to this stack alone, and the application reaches it there under the name
  `via-db`. The reason is written out under "Why the database is not on the shared
  network" below.
- A `.env` file beside `docker-compose.yml` holding `DB_USER`, `DB_PASSWORD`, `DB_NAME`,
  `CLIENT_URL`, `JWT_SECRET` and the Azure credentials
- A checkout of the Discord bot's repository beside this one, at
  `../viaillinois-bot`, able to fetch tags. The stack builds the bot's image from it.
  See "Deploying the Discord bot" below.
- Enough free disk for the retained backups. Each dump is roughly the size of the database.

The application image carries `mysqldump` and `mysql`, so the host does not need a MySQL
client of its own.

## Settings

Every one of these is an environment variable read by `scripts/cutover.sh`, and each has a
working default, so a normal deploy sets none of them.

| Variable | Default | What it does |
| --- | --- | --- |
| `BACKUP_DIR` | `./backups` | Host directory holding dumps. Mounted into the container at `/backups`. |
| `BACKUP_RETENTION_COUNT` | `10` | How many dumps of each database to keep. Older ones are pruned as each new dump lands, and the two databases are counted separately. |
| `HEALTH_TIMEOUT_SECONDS` | `60` | How long the new container has to report ready before the deploy rolls back. |
| `HEALTH_URL` | `http://localhost:3000/health` | The readiness endpoint the deploy gates on. |
| `DEPLOY_LOG` | `./deploy.log` | Where the deploy log is appended. |
| `DB_ADMIN_USER` | `root` | Account used for backup verification and restore. |
| `DB_ADMIN_PASSWORD` | value of `DB_PASSWORD` | Password for that account. |
| `BOT_CHECKOUT` | `../viaillinois-bot` | The checkout of the Discord bot the stack builds its image from. |
| `BOT_RELEASE_FILE` | `deploy/bot-release` | The file naming the bot tag this release deploys. |
| `BOT_HEALTH_URL` | `http://localhost:3002/health` | The bot's readiness endpoint, gated on after the website's. |
| `BOT_HEALTH_TIMEOUT_SECONDS` | `90` | How long the bot has to report ready. Longer than the website's, because it also has to reach Discord. |
| `BOT_DB_NAME` | `via_bot` | The bot's database, backed up and restored beside the website's. |

Backup verification creates a scratch database, and restore drops and recreates the
application database. The application account, `DB_USER`, is scoped to its own database and
can do neither, which is why those two steps use an administrative account. The default
works without configuration, because the compose file gives the root account the same
password it gives the application account.

## Cutting a release

A release is a version bump, a push, a green gate, and a cutover on the VPS, in that order.

1. Merge the work to `main` with the gate green on its pull request.
2. Run the bump on a clean tree on `main`:

   ```bash
   scripts/bump-version.sh <patch|minor|major>
   ```

   It writes the same version into the root, server and client manifests, opens
   `CHANGELOG.md` in your editor so you can describe the release under the new dated
   heading, then commits and creates an annotated tag. It refuses to run on a dirty tree,
   because that would tag a commit which does not match what was tested, and it refuses to
   run off `main`, because that would tag work which was never reviewed. It never pushes
   and never deploys.
3. Push the commit and the tag:

   ```bash
   git push && git push origin v<version>
   ```
4. Confirm the gate passes on the tag. The tag build runs the same three jobs as the pull
   request did, against the exact commit you are about to deploy.
5. On the VPS, run the cutover with the tag you just pushed:

   ```bash
   scripts/cutover.sh v<version>
   ```
6. Confirm `GET /health` reports the version you released and the migration version you
   expect:

   ```bash
   curl -fsS http://localhost:3000/health
   ```

   A `version` that does not match the tag means the running container is not the build you
   think it is.

## The release gate

`.github/workflows/gate.yml` runs on every pull request to `main` and on every `v*` tag.
Three jobs run in parallel, and all three are required. When one fails, the job name tells
you which class of problem you have.

The `quality` job covers the code itself:

- Version consistency, which fails when the three manifests disagree.
- The language check and its own tests, which fail on an em dash or an en dash anywhere in
  the repository.
- The bump script tests, which cover the version arithmetic and the two refusal conditions.
- The compose file tests, the cutover tests and the bot pin test. The cutover tests run the
  real script against stub `docker` and `curl` commands, so the order of its steps and each
  of its refusals is checked without a host to deploy to.
- The server fast tests, the client tests, and the client build.
- Coverage, which is reported and never enforced. There is no threshold, because a
  threshold chosen before the real number is known only ever gets lowered until it passes.
  Read the number, do not gate on it.

The `database` job covers the schema:

- Migrations apply cleanly from an empty database, using the same
  `docker-compose.test.yml` container that developers use locally, so a failure here is a
  real signal rather than a difference in how CI provisions its database.
- The bot database initialisation script runs, because that compose file mounts
  `server/db/init` the way production mounts it. A script that does not work stops the
  container from starting here rather than during a maintenance window on the server, and
  `server/tests/db/botDatabaseInit.db.test.js` then checks what it built, including that
  the bot's account cannot reach the web platform's database.
- The Drizzle drift check, which fails when a schema declaration was edited without a
  matching migration being generated. This is the failure mode that would otherwise let the
  development and production schemas separate silently.
- The database backed tests.

The `security` job covers the supply chain:

- `npm audit --audit-level=high` against the root, server and client manifests.
- Secret scanning over the full history.

A red gate is a blocked release, not a judgment call. The fix is to make the check pass, not
to weaken the check.

## Deploying

```bash
cd /path/to/via
scripts/cutover.sh v0.2.0
```

The argument is a web platform git tag that already exists and has been pushed. Which bot
tag goes with it is read from `deploy/bot-release` inside that tag, so this one command
deploys both services.

The order of the steps is the point. Everything that can fail cheaply happens before the
site goes down:

1. Refuse to start if either working tree is dirty, this one or the bot checkout, then
   check out the tag, read `deploy/bot-release`, and check the bot checkout out at the tag
   it names.
2. Build both images. A build failure costs no downtime at all.
3. Take a backup of each database, the web platform's and the bot's, and prove each one
   restores, by restoring it into a scratch database and comparing the row count of every
   table against the live database. A dump that does not restore fails the deploy here,
   while the site is still up.
4. The maintenance window opens: both application containers stop. The database container
   stays up throughout, as it does for the whole deploy.
5. Apply the web platform's migrations, then the bot's. The bot's run second, because a
   bot migration is written against a web platform that has already been migrated.
6. Start the new web platform image and wait for `GET /health` to report `ok`.
7. Start the new bot image and wait for its own `GET /health` to report `ok`. The window
   closes when it does. This order is not a preference: the bot's health answer stays
   unavailable until the web platform answers it, so a bot started first is a bot started
   into a failing health check.

If step 5, 6 or 7 fails, the script restores both backups it took in step 3, checks out
the previous tag in both checkouts, and rebuilds and restarts both previous images. Then
it exits non-zero.

## Deploying the Discord bot

The bot is a third container in this stack rather than a deployment of its own. It has its
own repository, its own version and its own `v*` tags, and this repository names the tag it
runs.

### The sibling checkout

The bot's image is built from a checkout of
https://github.com/max-bromberg/viaillinois-bot beside this one:

```bash
cd /path/to
git clone https://github.com/max-bromberg/viaillinois-bot.git
```

The path is `../viaillinois-bot` by default, and `BOT_CHECKOUT` moves it. The cutover
refuses a checkout that is not there and refuses one with a dirty working tree, in the same
words it uses for this repository, because a dirty tree there would build an image that is
not the tag anybody reviewed.

### The pin

`deploy/bot-release` holds one line, the bot tag this release deploys:

```
v0.1.0
```

The cutover reads it after checking out the release tag, so which bot a given website tag
runs is part of that tag rather than of the host. It then fetches tags in the sibling
checkout and checks out the tag named there.

A release of the bot alone is therefore a change to this one line, merged to `main` through
the gate, followed by a cutover. A release of the website alone leaves the line as it is and
redeploys the same bot. There is no way to deploy a bot tag that is not written down here.

### Settings the bot needs

These live in the same `.env` file beside `docker-compose.yml`. Every one of them is
described in `.env.example`.

| Variable | What it is |
| --- | --- |
| `DISCORD_TOKEN` | The bot account's token, from the Discord application. |
| `DISCORD_APPLICATION_ID` | The Discord application's identifier. |
| `DISCORD_PUBLIC_KEY` | The Discord application's public key. |
| `DISCORD_CLIENT_ID` | The same application, as the website's account link flow authorizes against it. |
| `DISCORD_CLIENT_SECRET` | The secret for that flow. |
| `DISCORD_LINK_KEY` | The key the stored Discord authorization is encrypted with. |
| `DISCORD_INTEREST_SALT` | The salt interest from an unlinked Discord account is hashed under. |
| `BOT_SERVICE_TOKEN` | The token the bot presents at the internal service API. Both containers read it. |
| `BOT_DB_USER` | The bot's database account, which reaches its own database and nothing else. |
| `BOT_DB_PASSWORD` | That account's password. |
| `BOT_DB_NAME` | The bot's database, `via_bot` by default. |
| `BOT_HEALTH_PORT` | The host port the bot's health endpoint is published on, `3002` by default. |

The bot's container is deliberately not given `DB_USER`, `DB_PASSWORD` or `JWT_SECRET`.
Everything it knows about events, memberships and people it reads and writes through the
internal service API, which decides every authorization question itself, and an account or
a signing secret in that container would be a way around that.

### The bot's database

`server/db/init/01-bot-database.sh` creates the `via_bot` database and the account scoped
to it. The database container runs it from `/docker-entrypoint-initdb.d`, which MySQL reads
only once, on an empty data directory. A host that already has a database therefore never
runs it, and production is exactly such a host, so run the same statements there by hand,
once, before the first cutover that includes the bot:

```bash
docker compose exec db mysql -uroot -p"$DB_PASSWORD" <<'SQL'
CREATE DATABASE IF NOT EXISTS `via_bot` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'via_bot'@'%' IDENTIFIED BY 'the value of BOT_DB_PASSWORD';
GRANT ALL PRIVILEGES ON `via_bot`.* TO 'via_bot'@'%';
FLUSH PRIVILEGES;
SQL
```

That is the one place this procedure asks for SQL by hand, and it is the one thing no
migration can do for itself: the database and the account have to exist before there is
anything to connect as. No table is created there. Every table in `via_bot` comes from a
migration under the bot's `src/db/migrations`, applied by the cutover.

Without this, the cutover fails while taking the bot's backup, before the maintenance
window opens and with the site still up.

### Cutting a bot release

1. In the bot's repository, on a clean tree on `main` with its gate green, run
   `scripts/bump-version.sh <patch|minor|major>`, then push the commit and the tag and
   confirm its gate passes on the tag.
2. In this repository, change the line in `deploy/bot-release` to that tag, open a pull
   request, and merge it with the gate green.
3. If the website is releasing anything of its own in the same cutover, bump it as usual.
   Otherwise deploy the tag that carries the changed pin.
4. Run `scripts/cutover.sh v<version>` on the VPS as always, and confirm both health
   endpoints:

   ```bash
   curl -fsS http://localhost:3000/health
   curl -fsS http://localhost:3002/health
   ```

   The bot's answer is `unavailable` until it has a gateway connection, a database that
   answers, and an answer from the website, so an `ok` there is a statement that all three
   are true.

## Why the database is not on the shared network

The production host runs many unrelated stacks, and `internal` carries all of them.
Compose gives every service the alias of its own service name on each network it joins,
so a service called `db` answers to the name `db` there. Three stacks on that host run a
service by that name, which meant `db` resolved to three different servers: this
database, a proxy manager's MariaDB, and an unrelated PostgreSQL. Docker hands the
addresses out in turn, so every connection was a draw between the three, and roughly two
in three were refused.

The symptoms were intermittent and looked like several different problems. Users saw
`Access denied` on the public feed at random. A cutover took a valid backup and then
failed to verify it seconds later, because the dump and the verification drew different
servers. None of it was a credential problem or a connection pool problem.

The database now sits on a network private to this stack and answers to `via-db`, a name
no other stack uses. Only the application joins both networks, because only the
application needs to be reachable by the proxy. Nothing else on the host can reach the
database at all, which is how it should have been from the start.

A test in `scripts/tests/composeFile.test.js` holds this arrangement in place, and the
gate runs it.

## Reading the deploy log

Every line is timestamped and prefixed with `[cutover]`, and goes to both the terminal and
`deploy.log`. A successful deploy ends with a line naming the tag, the health response
including the applied migration version, and the backup path. A failed one ends with
`FAILED:` and, if the failure happened after the window opened, a `rollback complete` line
above it.

If you see `WARNING: database restore failed` inside a rollback, stop and restore by hand.
That warning means the site is running the previous image over a database that may still be
in its half migrated state.

## Restoring a backup by hand

Dumps are on the host in `BACKUP_DIR`, and the same files appear at `/backups` inside the
container. To restore one:

```bash
docker compose run --rm --entrypoint node via db/backup/restoreCli.js /backups/<dump-file>.sql
```

The same two scripts serve both databases, and `--database` names the one to work on. The
bot's dumps are the files whose names begin with `via_bot`:

```bash
docker compose run --rm --entrypoint node via \
  db/backup/restoreCli.js /backups/<dump-file>.sql --database via_bot
```

This drops the database and recreates it from the dump. Anything written since that dump is
gone, so take a fresh backup first if the current state has any value:

```bash
docker compose run --rm --entrypoint node via \
  db/backup/backupCli.js --dir /backups --retention 10
```

## Adding a migration

Migrations are plain SQL files in `server/db/migrations`, applied in journal order, and
authored by hand.

1. Create `server/db/migrations/000N_short_name.sql`. Separate statements with a line
   containing `--> statement-breakpoint`. Do not use `DELIMITER`: it is a command of the
   `mysql` client rather than SQL, and the runner sends statements over the protocol.
2. Add a matching entry to `server/db/migrations/meta/_journal.json`, copying the shape of
   the entries already there. The `when` value orders the migration and must be greater
   than the previous one.
3. Update the declarations in `server/db/schema/schema.ts` if the change affects a table
   that Drizzle queries.
4. Write a test that fails without the migration, under `server/tests/db`, and run
   `cd server && npm run test:db`.

Do not run `drizzle-kit generate` and apply its output without reading it. Against this
schema it produces a migration that renames every foreign key and drops and recreates
constraints, which changes nothing and risks a great deal. The reasons are recorded in
`docs/superpowers/notes/2026-08-27-baseline-diff.md`.

## The first deploy onto the existing production database

Production carries the schema already and has no migration bookkeeping, because it predates
the migration system. The runner detects exactly that case: when it finds a database whose
tables are precisely the baseline's, with no bookkeeping table, it records the baseline as
applied without executing it, and then applies everything after it. An empty database gets
the baseline for real. A database matching neither description is refused rather than
guessed at, and the deploy stops.

The practical effect of the first deploy is that `GetRSOStats` and
`trg_auto_confirm_midterm` reach production for the first time. `CALL GetRSOStats` returns
error 1305 there today, and midterm auto confirmation has never fired.

## Current limitation: backups are on-box only

Dumps are written to a directory on the same VPS as the database they came from. Losing the
host loses the database and every backup of it at the same moment.

This is a real gap and it is stated plainly rather than buried. This work makes deploys
safe: no deploy can lose data without a verified restore point taken minutes earlier, and
every deploy can be undone. It does not make the host expendable.

Moving backups off the box is tracked as follow-up work. The code is ready for it: the
destination is an interface in `server/db/backup/destination.js`, and an off-box target is a
new implementation of `store`, `list` and `prune` rather than a change to the cutover
script. What it needs first is a decision about where the backups should live.

## Cloudflare and the origin

Traffic reaches VIA through Cloudflare's proxy, then through the Nginx Proxy Manager
container on the host, then to the `via` service. The application depends on two properties
of that arrangement, and both are configuration rather than code.

### Nginx Proxy Manager accepts Cloudflare only

Ports 80 and 443 accept connections only from Cloudflare's published address ranges. This
is the trust boundary the whole client identity design rests on. `server/lib/clientIdentity.js`
reads the visitor's address from the `CF-Connecting-IP` header, which Cloudflare writes
itself, and a client able to reach the origin directly could write that header itself
instead. No application code can tell the difference, because the socket peer Express sees
is always the proxy container.

Cloudflare publishes its ranges at https://www.cloudflare.com/ips/ and changes them
occasionally. Refresh the allow list when they do.

### Recommended Cloudflare configuration

The edge absorbs volume before it reaches the host and before it touches the monthly
transfer budget. It cannot see what a request costs and cannot tell a board member from a
visitor, so it is the outer layer rather than the protection itself.

| Setting | Value | Why |
| --- | --- | --- |
| Rate limiting rule on `/api/v1/*` | 600 requests per minute per address | Well above the origin's own budget of 120, so the two layers do not fight. This one stops a flood, and the origin one stops a collector. |
| Bot Fight Mode | On | Costs nothing and turns away the least sophisticated traffic. |
| Cache rules | Respect origin headers | The application already sets a public lifetime on the kiosk and semester routes and `no-store` on everything else. Overriding that at the edge would put one person's answer in front of another. |
| Browser Integrity Check | Off | It challenges readers, and the platform is meant to be open. |

### Tuning the origin limits

Every threshold is an environment variable on the `via` service, so changing one is a
restart rather than a release.

| Variable | Default | What it does |
| --- | --- | --- |
| `TRUSTED_PROXY_HOPS` | `2` | Cloudflare then Nginx Proxy Manager. Change only if the chain changes. |
| `SHED_LAG_MS` | `200` | Event loop delay above which requests start being refused |
| `SHED_MAX_INFLIGHT` | `200` | Concurrent requests above which requests start being refused |
| `SHED_MAX_DB_WAITERS` | `20` | Callers queued for a database connection before refusing |
| `SHED_RECOVERY_RATIO` | `0.6` | How far a signal must recede before refusing stops |
| `SHED_RETRY_AFTER_SECONDS` | `30` | Retry window on a 503 |
| `DB_QUEUE_LIMIT` | `50` | Callers allowed to queue for a connection |
| `PUBLIC_REQUESTS_PER_MINUTE` | `120` | Anonymous request budget |
| `PUBLIC_ROWS_PER_HOUR` | `5000` | Anonymous row budget, which is the anti-scrape signal |
| `BUDGET_RETRY_AFTER_SECONDS` | `60` | Retry window on a 429 |
| `DENIAL_FLUSH_INTERVAL_MS` | `60000` | How often refusal counts are written |
| `DENIAL_RETENTION_DAYS` | `90` | How long refusal counts are kept |

Read the Availability tab on the admin page before changing any of them. A week with no
`row_budget` or `rate_limited` refusals against the feed routes means the budgets are not
touching real readers, and a week with many means they are too tight.
