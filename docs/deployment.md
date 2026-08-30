# Deploying VIA

VIA runs on a single VPS: MySQL 8.0 in a container beside the application container, both
managed by Docker Compose. Deploys go through `scripts/cutover.sh` and nothing else. No
manual `docker compose up` against production, and no manual SQL against the production
database.

## Prerequisites on the host

- Docker with the Compose plugin
- Git, with the deployment checkout able to fetch tags
- `curl`
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
