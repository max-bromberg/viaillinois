#!/usr/bin/env bash
#
# The only supported way to deploy VIA.
#
# Ordering is deliberate: every step that can fail cheaply runs before the
# maintenance window opens. By the time the application container stops, the
# only remaining failure modes have a tested recovery path.
#
# Two services are deployed here, the website and the Discord bot, from two
# checkouts. The bot is not released on its own: this repository pins the bot
# tag it deploys in deploy/bot-release, and one cutover brings both up.
#
# Usage: scripts/cutover.sh <release-tag>
set -euo pipefail

RELEASE_TAG="${1:?usage: cutover.sh <release-tag>}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-10}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-60}"
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/health}"
DEPLOY_LOG="${DEPLOY_LOG:-./deploy.log}"

# The bot is built from a checkout of its own repository beside this one, at
# the tag named in the pin file. The bot's health endpoint is given a longer
# window than the website's, because the bot answers unavailable until it has
# both a gateway connection and an answer from the website, and a gateway
# connection is made over the public internet.
BOT_CHECKOUT="${BOT_CHECKOUT:-../viaillinois-bot}"
BOT_RELEASE_FILE="${BOT_RELEASE_FILE:-deploy/bot-release}"
BOT_HEALTH_URL="${BOT_HEALTH_URL:-http://localhost:3002/health}"
BOT_HEALTH_TIMEOUT_SECONDS="${BOT_HEALTH_TIMEOUT_SECONDS:-90}"
BOT_DB_NAME="${BOT_DB_NAME:-via_bot}"

# The container path is fixed by the bind mount in docker-compose.yml. The host
# directory it points at is BACKUP_DIR, which the compose file reads too.
BACKUP_MOUNT="/backups"

export BACKUP_DIR
# Compose reads this too: it is the build context of the via-bot service, and
# an unexported setting would move the checkout for this script alone.
export BOT_CHECKOUT

log()  { echo "[cutover] $(date -Iseconds) $*" | tee -a "$DEPLOY_LOG"; }
fail() { log "FAILED: $*"; exit 1; }

PREVIOUS_TAG="$(git describe --tags --abbrev=0 2>/dev/null || echo none)"
BOT_PREVIOUS_TAG="none"
BOT_TAG=""
BACKUP_PATH=""
BOT_BACKUP_PATH=""

# Both databases live on one server and are backed up and restored by the same
# code, which takes the database it works on as an argument. The website's
# container is what runs it, because that is the container carrying mysqldump
# and the administrative account.
restore_database() {
  local path="$1"
  shift
  docker compose run --rm --entrypoint node via \
    db/backup/restoreCli.js "$path" "$@" || log "WARNING: database restore failed"
}

# Readiness, not the container merely existing. Returns non-zero when the
# endpoint has not answered ok inside the window it was given.
wait_for_health() {
  local url="$1"
  local timeout="$2"
  local deadline
  deadline=$(( $(date +%s) + timeout ))
  until curl -fsS "$url" | grep -q '"status":"ok"'; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      return 1
    fi
    sleep 2
  done
}

rollback() {
  log "rolling back to ${PREVIOUS_TAG}, bot to ${BOT_PREVIOUS_TAG}"
  if [ -n "$BACKUP_PATH" ]; then
    log "restoring database from ${BACKUP_PATH}"
    restore_database "$BACKUP_PATH"
  fi
  if [ -n "$BOT_BACKUP_PATH" ]; then
    log "restoring bot database from ${BOT_BACKUP_PATH}"
    restore_database "$BOT_BACKUP_PATH" --database "$BOT_DB_NAME"
  fi
  if [ "$PREVIOUS_TAG" != "none" ]; then
    git checkout "$PREVIOUS_TAG" --quiet || log "WARNING: could not check out ${PREVIOUS_TAG}"
  else
    log "WARNING: no previous tag to check out, leaving the tree on ${RELEASE_TAG}"
  fi
  if [ "$BOT_PREVIOUS_TAG" != "none" ]; then
    git -C "$BOT_CHECKOUT" checkout "$BOT_PREVIOUS_TAG" --quiet \
      || log "WARNING: could not check out ${BOT_PREVIOUS_TAG} in ${BOT_CHECKOUT}"
  else
    log "WARNING: no previous bot tag to check out, leaving that checkout where it is"
  fi
  docker compose up -d --build via via-bot || log "WARNING: could not restart previous images"
  log "rollback complete"
}

# Step 1: refuse to deploy from a dirty or unexpected tree. Both trees are
# checked before either is moved, because deploying from a dirty one would
# ship something other than the tag that was tested.
[ -z "$(git status --porcelain)" ] || fail "working tree is dirty"
[ -d "$BOT_CHECKOUT/.git" ] || fail "no bot checkout at ${BOT_CHECKOUT}, clone it beside this one"
[ -z "$(git -C "$BOT_CHECKOUT" status --porcelain)" ] \
  || fail "bot working tree is dirty at ${BOT_CHECKOUT}"
BOT_PREVIOUS_TAG="$(git -C "$BOT_CHECKOUT" describe --tags --abbrev=0 2>/dev/null || echo none)"

git fetch --tags --quiet
git checkout "$RELEASE_TAG" --quiet || fail "no such tag: ${RELEASE_TAG}"
log "checked out ${RELEASE_TAG}, previous was ${PREVIOUS_TAG}"

# The pin is read after the checkout, because which bot a release runs is part
# of the release rather than of the checkout that deploys it.
[ -f "$BOT_RELEASE_FILE" ] || fail "no bot tag pinned in ${BOT_RELEASE_FILE}"
BOT_TAG="$(head -n 1 "$BOT_RELEASE_FILE" | tr -d '[:space:]')"
[[ "$BOT_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] \
  || fail "${BOT_RELEASE_FILE} does not name a version tag: ${BOT_TAG}"

git -C "$BOT_CHECKOUT" fetch --tags --quiet
if ! git -C "$BOT_CHECKOUT" checkout "$BOT_TAG" --quiet; then
  # Nothing has been built and no container has been touched, so putting this
  # tree back where it was leaves the host exactly as it was found.
  [ "$PREVIOUS_TAG" = "none" ] || git checkout "$PREVIOUS_TAG" --quiet || true
  fail "no such bot tag: ${BOT_TAG} in ${BOT_CHECKOUT}"
fi
log "checked out bot ${BOT_TAG}, previous was ${BOT_PREVIOUS_TAG}"

# Step 2: build before touching anything. A build failure costs no downtime.
docker compose build via via-bot || fail "image build failed"
log "images built"

# Step 3: back up and prove the backups restore. Still no downtime so far.
mkdir -p "$BACKUP_DIR"
BACKUP_PATH="$(docker compose run --rm --entrypoint node via \
  db/backup/backupCli.js --dir "$BACKUP_MOUNT" --retention "$BACKUP_RETENTION_COUNT")" \
  || fail "backup or backup verification failed"
log "backup verified at ${BACKUP_PATH} (host: ${BACKUP_DIR}/$(basename "$BACKUP_PATH"))"

# The bot's database, through the same code. A failure here on a host whose
# database predates the bot means the database and its account were never
# created, and docs/deployment.md carries the statements that create them.
BOT_BACKUP_PATH="$(docker compose run --rm --entrypoint node via \
  db/backup/backupCli.js --dir "$BACKUP_MOUNT" --retention "$BACKUP_RETENTION_COUNT" \
  --database "$BOT_DB_NAME")" \
  || fail "backup or backup verification of ${BOT_DB_NAME} failed"
log "bot backup verified at ${BOT_BACKUP_PATH} (host: ${BACKUP_DIR}/$(basename "$BOT_BACKUP_PATH"))"

# ---- maintenance window opens here ----
log "stopping application containers, maintenance window open"
docker compose stop via-bot || fail "could not stop bot container"
docker compose stop via || fail "could not stop application container"

# Step 4: migrate. The database container stays up throughout. The runner stamps
# the baseline first if it finds a database that predates the migration system.
if ! docker compose run --rm --entrypoint node via --experimental-strip-types db/migrate.ts; then
  rollback
  fail "migration failed, rolled back"
fi
log "migrations applied"

# The bot's own database, its own migrations, its own runner. It runs second
# because a bot migration is written against a website that has already been
# migrated, never the other way round.
#
# --no-deps because the bot service declares the website as something it
# depends on, and compose would otherwise start the website here, in the middle
# of the maintenance window and with nothing gating on its health. The database
# is a dependency too, and it is up: the cutover never stops it.
if ! docker compose run --rm --no-deps --entrypoint node via-bot \
  --experimental-strip-types src/db/migrate.ts; then
  rollback
  fail "bot migration failed, rolled back"
fi
log "bot migrations applied"

# Step 5: start the new images, the website first. The bot answers unavailable
# until the website answers it, so starting the bot into a website that is not
# up yet only means starting it into a failing health check.
docker compose up -d via || { rollback; fail "could not start new image, rolled back"; }

# Step 6: gate on readiness, not on the container merely existing.
if ! wait_for_health "$HEALTH_URL" "$HEALTH_TIMEOUT_SECONDS"; then
  rollback
  fail "health check did not pass within ${HEALTH_TIMEOUT_SECONDS}s, rolled back"
fi
log "web platform healthy"

docker compose up -d via-bot || { rollback; fail "could not start new bot image, rolled back"; }

if ! wait_for_health "$BOT_HEALTH_URL" "$BOT_HEALTH_TIMEOUT_SECONDS"; then
  rollback
  fail "bot health check did not pass within ${BOT_HEALTH_TIMEOUT_SECONDS}s, rolled back"
fi
# ---- maintenance window closes here ----

VERSION="$(curl -fsS "$HEALTH_URL")"
BOT_VERSION="$(curl -fsS "$BOT_HEALTH_URL")"
log "cutover complete: tag=${RELEASE_TAG} bot=${BOT_TAG} health=${VERSION} bot-health=${BOT_VERSION}"
log "backups: ${BACKUP_PATH} and ${BOT_BACKUP_PATH}"
