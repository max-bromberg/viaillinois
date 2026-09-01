#!/usr/bin/env bash
#
# Build a local preview database: start the container, apply the migrations,
# and load development fixtures and demo data.
#
# This is for previewing work in progress. It is not the test database, which
# lives in docker-compose.test.yml and is wiped between runs, and it has
# nothing to do with production, which is deployed by scripts/cutover.sh.
#
# Usage: scripts/dev-db.sh [--reset]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env.dev"
COMPOSE="$ROOT/docker-compose.dev.yml"

# Written rather than described. Getting these values right by hand means
# knowing that the migration runner connects as an administrative account and
# falls back to DB_PASSWORD, which is not something anyone should have to work
# out before they can run the app.
if [ ! -f "$ENV_FILE" ]; then
  echo "creating $ENV_FILE for the preview database"
  sed -e 's|^DB_HOST=.*|DB_HOST=127.0.0.1|' \
      -e 's|^DB_PORT=.*|DB_PORT=3308|' \
      -e 's|^DB_USER=.*|DB_USER=via|' \
      -e 's|^DB_PASSWORD=.*|DB_PASSWORD=dev_pw|' \
      -e 's|^DB_NAME=.*|DB_NAME=via|' \
      "$ROOT/.env.example" > "$ENV_FILE"
  {
    echo
    echo '# The pollers scrape Course Explorer and Ad Astra on boot. A preview instance'
    echo '# has no business sending that traffic to the university.'
    echo 'POLLERS_ENABLED=false'
  } >> "$ENV_FILE"
  echo "  edit it if you need Azure sign in locally, otherwise it is ready"
fi

if [ "${1:-}" = "--reset" ]; then
  echo "removing the existing preview database"
  docker compose -f "$COMPOSE" down -v
fi

docker compose -f "$COMPOSE" up -d dev-db

# The container healthcheck reports healthy shortly before MySQL finishes its
# first boot initialization, so a real connection is the only honest signal.
# tests/support/testDb.js waits the same way and for the same reason.
echo "waiting for the database to accept connections"
cd "$ROOT/server"
node --env-file="$ENV_FILE" -e '
import("mysql2/promise").then(async (mysql) => {
  const config = {
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
  const deadline = Date.now() + 120000;
  let last;
  while (Date.now() < deadline) {
    try {
      const conn = await mysql.default.createConnection(config);
      await conn.query("SELECT 1");
      await conn.end();
      process.exit(0);
    } catch (err) {
      last = err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  console.error(`database did not become ready: ${last?.message}`);
  process.exit(1);
});
'

node --experimental-strip-types --env-file="$ENV_FILE" db/migrate.ts
node --env-file="$ENV_FILE" scripts/seedDevFixtures.js
node --env-file="$ENV_FILE" scripts/seed.js | tail -14

echo
echo "preview database ready on port 3308. Start the app with: npm run dev:local"
