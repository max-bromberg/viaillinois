# Changelog

All notable changes to VIA are recorded here. Versions follow semantic versioning.

## Unreleased

## 0.2.3 (2026-08-31)

- The database no longer sits on the shared network named internal. That network carries every stack on the production host, Compose gives each service the alias of its own name on it, and three stacks there run a service called db, so the name resolved to three different servers and each connection was a draw between them. The database now sits on a network private to this stack under the name via-db, which no other stack answers to. This is the cause of the intermittent access denied errors on the public feed.
- A failed database restore now reports the error the client gave. The dump was piped into the client with no error handler on that stream, so when the client rejected a statement and stopped reading, the resulting write failure became an uncaught exception that killed the process before the exit code and the message could be read. Every restore failure surfaced as an unexplained EPIPE, including during a cutover and during a rollback.

## 0.2.2 (2026-08-30)

- The compose file now declares the external network named internal that the reverse proxy uses to reach the application by service name. It was previously an edit that existed only on the production host.
- A test guards the compose file against the three ways it has drifted or could drift: a schema mount into docker-entrypoint-initdb.d, a missing host backup mount, and a missing external network. The gate runs it.

## 0.2.1 (2026-08-30)

- The release gate now runs on pull requests to main and on version tags, and its three jobs are required by branch protection.
- The database schema is defined by migrations under server/db/migrations, applied by a locking migration runner, with a drift check in the gate.
- Deploys go through scripts/cutover.sh, which takes a verified backup, applies migrations, checks health, and rolls back on failure.
- The health endpoint is a real readiness check, and it reports the application version and the applied migration version.
- The root, server and client packages report one platform version, kept equal by a test in the gate.
- User facing copy and documentation no longer contain em dashes or en dashes, enforced by npm run check:language.
