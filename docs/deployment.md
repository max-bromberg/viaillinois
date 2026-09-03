# Deploying VIA

VIA runs on a single VPS: MySQL 8.0 in a container beside the application container, both
managed by Docker Compose. Deploys go through `scripts/cutover.sh` and nothing else. No
manual `docker compose up` against production, and no manual SQL against the production
database.

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
- Enough free disk for the retained backups. Each dump is roughly the size of the database.

The application image carries `mysqldump` and `mysql`, so the host does not need a MySQL
client of its own.

## Settings

Every one of these is an environment variable read by `scripts/cutover.sh`, and each has a
working default, so a normal deploy sets none of them.

| Variable | Default | What it does |
| --- | --- | --- |
| `BACKUP_DIR` | `./backups` | Host directory holding dumps. Mounted into the container at `/backups`. |
| `BACKUP_RETENTION_COUNT` | `10` | How many dumps to keep. Older ones are pruned as each new dump lands. |
| `HEALTH_TIMEOUT_SECONDS` | `60` | How long the new container has to report ready before the deploy rolls back. |
| `HEALTH_URL` | `http://localhost:3000/health` | The readiness endpoint the deploy gates on. |
| `DEPLOY_LOG` | `./deploy.log` | Where the deploy log is appended. |
| `DB_ADMIN_USER` | `root` | Account used for backup verification and restore. |
| `DB_ADMIN_PASSWORD` | value of `DB_PASSWORD` | Password for that account. |

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
- The server fast tests, the client tests, and the client build.
- Coverage, which is reported and never enforced. There is no threshold, because a
  threshold chosen before the real number is known only ever gets lowered until it passes.
  Read the number, do not gate on it.

The `database` job covers the schema:

- Migrations apply cleanly from an empty database, using the same
  `docker-compose.test.yml` container that developers use locally, so a failure here is a
  real signal rather than a difference in how CI provisions its database.
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

The argument is a git tag that already exists and has been pushed.

The order of the steps is the point. Everything that can fail cheaply happens before the
site goes down:

1. Refuse to start if the working tree is dirty, then check out the tag.
2. Build the image. A build failure costs no downtime at all.
3. Take a backup and prove it restores, by restoring it into a scratch database and
   comparing the row count of every table against the live database. A dump that does not
   restore fails the deploy here, while the site is still up.
4. The maintenance window opens: the application container stops.
5. Apply migrations. The database container stays up throughout.
6. Start the new image.
7. Wait for `GET /health` to report `ok`. The window closes when it does.

If step 5, 6 or 7 fails, the script restores the backup it took in step 3, checks out the
previous tag, and rebuilds and restarts the previous image. Then it exits non-zero.

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
