#!/usr/bin/env bash
#
# The only supported way to deploy VIA.
#
# Ordering is deliberate: every step that can fail cheaply runs before the
# maintenance window opens. By the time the application container stops, the
# only remaining failure modes have a tested recovery path.
#
# Usage: scripts/cutover.sh <release-tag>
set -euo pipefail

RELEASE_TAG="${1:?usage: cutover.sh <release-tag>}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-10}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-60}"
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/health}"
DEPLOY_LOG="${DEPLOY_LOG:-./deploy.log}"

# The container path is fixed by the bind mount in docker-compose.yml. The host
# directory it points at is BACKUP_DIR, which the compose file reads too.
BACKUP_MOUNT="/backups"

export BACKUP_DIR

log()  { echo "[cutover] $(date -Iseconds) $*" | tee -a "$DEPLOY_LOG"; }
fail() { log "FAILED: $*"; exit 1; }

PREVIOUS_TAG="$(git describe --tags --abbrev=0 2>/dev/null || echo none)"
BACKUP_PATH=""

rollback() {
  log "rolling back to ${PREVIOUS_TAG}"
  if [ -n "$BACKUP_PATH" ]; then
    log "restoring database from ${BACKUP_PATH}"
    docker compose run --rm --entrypoint node via \
      db/backup/restoreCli.js "$BACKUP_PATH" || log "WARNING: database restore failed"
  fi
  if [ "$PREVIOUS_TAG" != "none" ]; then
    git checkout "$PREVIOUS_TAG" --quiet || log "WARNING: could not check out ${PREVIOUS_TAG}"
  else
    log "WARNING: no previous tag to check out, leaving the tree on ${RELEASE_TAG}"
  fi
  docker compose up -d --build via || log "WARNING: could not restart previous image"
  log "rollback complete"
}

# Step 1: refuse to deploy from a dirty or unexpected tree.
[ -z "$(git status --porcelain)" ] || fail "working tree is dirty"
git fetch --tags --quiet
git checkout "$RELEASE_TAG" --quiet || fail "no such tag: ${RELEASE_TAG}"
log "checked out ${RELEASE_TAG}, previous was ${PREVIOUS_TAG}"

# Step 2: build before touching anything. A build failure costs no downtime.
docker compose build via || fail "image build failed"
log "image built"

# Step 3: back up and prove the backup restores. Still no downtime so far.
mkdir -p "$BACKUP_DIR"
BACKUP_PATH="$(docker compose run --rm --entrypoint node via \
  db/backup/backupCli.js --dir "$BACKUP_MOUNT" --retention "$BACKUP_RETENTION_COUNT")" \
  || fail "backup or backup verification failed"
log "backup verified at ${BACKUP_PATH} (host: ${BACKUP_DIR}/$(basename "$BACKUP_PATH"))"

# ---- maintenance window opens here ----
log "stopping application container, maintenance window open"
docker compose stop via || fail "could not stop application container"

# Step 4: migrate. The database container stays up throughout. The runner stamps
# the baseline first if it finds a database that predates the migration system.
if ! docker compose run --rm --entrypoint node via --experimental-strip-types db/migrate.ts; then
  rollback
  fail "migration failed, rolled back"
fi
log "migrations applied"

# Step 5: start the new image.
docker compose up -d via || { rollback; fail "could not start new image, rolled back"; }

# Step 6: gate on readiness, not on the container merely existing.
deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SECONDS ))
until curl -fsS "$HEALTH_URL" | grep -q '"status":"ok"'; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    rollback
    fail "health check did not pass within ${HEALTH_TIMEOUT_SECONDS}s, rolled back"
  fi
  sleep 2
done
# ---- maintenance window closes here ----

VERSION="$(curl -fsS "$HEALTH_URL")"
log "cutover complete: tag=${RELEASE_TAG} health=${VERSION} backup=${BACKUP_PATH}"
