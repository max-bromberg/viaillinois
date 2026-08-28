# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project Overview

**VIA (Virtually Integrated Agenda)** is a centralized event management platform for
UIUC's ECE department RSOs, running in public at viaillinois.com. It began as a CS411
course project. The course has ended. VIA is now a volunteer, public-good project with
real users, and it is maintained to production standards.

Main surfaces:
- **Public Feed**: students discover ECE RSO events in one place
- **Logistics Dashboard**: RSO admins create and manage events
- **Midterms**: crowdsourced exam schedule with upvote and downvote scoring
- **Kiosk**: full screen rotating display for building lobbies

## Tech Stack

- **Database**: MySQL 8.0 in a container, alongside the app on a single VPS
- **Backend**: Node.js (ESM) + Express 5, `mysql2` for raw queries, migrating to Drizzle
- **Frontend**: Svelte 5 + Vite, Tailwind CSS, shadcn-svelte
- **Auth**: `passport-azure-ad` (UIUC NetID via Azure AD OIDC) + `passport-local` fallback,
  JWT in an httpOnly cookie named `via_token`

## Non-Negotiable Rules

1. **Test driven development, always.** Write the failing test first, run it and observe
   it fail for the right reason, write the minimal implementation, run it and observe it
   pass. This applies to bug fixes as much as to features: a bug fix starts with a test
   that reproduces the bug.
2. **Nothing ships without the release gate.** No build is packaged or deployed until the
   quality and security gate passes. A red gate is a blocked release, not a judgment call.
3. **Never auto-commit.** Do not run `git commit` unless the user explicitly asks.
4. **Every schema change is a migration.** Never edit a schema file and assume the change
   reaches production. Migrations are the only path into the production database.
5. **The data layer is moving to Drizzle, incrementally.** New data access code uses
   Drizzle. Existing raw `mysql2` queries are converted deliberately, table by table, with
   tests, never opportunistically in the middle of unrelated work. Both styles share one
   connection pool.
6. **Production deploys go through the cutover script only.** No manual `docker compose up`
   against production, and no manual SQL against the production database.

## User Facing Language Constraints

These apply to every string a user can read: UI copy, error messages, emails, page titles,
seeded content, and documentation.

- **No em dashes and no en dashes.** Use commas, colons, parentheses, or a full stop.
- **No choppy fragment rhythm.** Do not write sentence fragments for emphasis, and do not
  use the "it's not this, it's that" construction. Write complete sentences.
- **No invented abbreviations or names.** Do not coin a shortened name for a project
  structure, table, service, or feature. Use the name the codebase already uses, in full.

## Repository Layout

- `server/` Express API, services, background pollers, database access
- `client/` Svelte frontend
- `docs/superpowers/specs/` design specs, one per work package
- `docs/superpowers/plans/` implementation plans, one per spec
- `doc/` legacy course documents, retained for history only

## Commands

- `npm run install:all` install root, server and client dependencies
- `npm run dev` run server and client together
- `npm run test:client` client test suite
- `cd server && npx vitest run` server test suite
