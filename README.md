<div align="center">

# VIA

### Virtually Integrated Agenda

**Every ECE event at Illinois, in one place.**

[**viaillinois.com**](https://viaillinois.com)

[![gate](https://github.com/max-bromberg/viaillinois/actions/workflows/gate.yml/badge.svg?branch=main)](https://github.com/max-bromberg/viaillinois/actions/workflows/gate.yml)
[![release](https://img.shields.io/github/v/tag/max-bromberg/viaillinois?label=release&sort=semver)](https://github.com/max-bromberg/viaillinois/releases)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[![Node](https://img.shields.io/badge/Node-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind-CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)

</div>

---

VIA is a centralized event management platform for the Registered Student Organizations of
the Electrical and Computer Engineering department at the University of Illinois
Urbana-Champaign. It gives students one place to discover events across every ECE RSO, and
it gives RSO boards a logistics dashboard to create and manage those events without the
chaos of scattered email lists, Discord servers, and Instagram posts.

VIA began as a CS411 course project. The course has ended. It now runs in public at
[viaillinois.com](https://viaillinois.com) as a volunteer, public-good project with real
users, and it is maintained to production standards.

## Surfaces

| Surface | What it does |
|---|---|
| **Public feed** | Students browse and filter upcoming ECE RSO events, with no account required |
| **Logistics dashboard** | RSO admins create, edit and manage events, including repeating series |
| **Midterms** | A crowdsourced exam schedule with upvote and downvote scoring |
| **Kiosk** | A full screen rotating display for building lobbies |

## Features

- **UIUC NetID login**: authenticate with your Illinois credentials via Azure AD OIDC
- **Conflict detection**: surface scheduling conflicts before they happen
- **Calendar import**: bring an existing RSO calendar in as an `.ics` file
- **Repeating events**: enter a term of weekly meetings as one request
- **QR codes**: per-event QR codes for check-in
- **Automatic ingestion**: background pollers pull room and course data from campus sources

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Svelte 5, Vite, Tailwind CSS, shadcn-svelte |
| Backend | Node.js (ESM), Express 5 |
| Database | MySQL 8.0, accessed through `mysql2` and Drizzle over one pool |
| Auth | passport-azure-ad (UIUC NetID / Azure AD OIDC), passport-local fallback |
| Discord | The companion bot in [viaillinois-bot](https://github.com/max-bromberg/viaillinois-bot), deployed as a third container in this stack |
| Production | A single VPS running MySQL 8.0, the application and the Discord bot as sibling containers |

## Getting Started

### Prerequisites

- Node.js 20+
- MySQL 8.0+

### Setup

1. **Clone the repo**

   ```bash
   git clone https://github.com/max-bromberg/viaillinois.git
   cd viaillinois
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your MySQL credentials and (optionally) Azure AD app registration details for UIUC NetID login. See [Environment Variables](#environment-variables) below.

3. **Install dependencies**

   ```bash
   npm run install:all
   ```

4. **Create the database**

   The schema is built by running the migrations, not by loading a schema file.

   ```bash
   mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS via"
   cd server && node --experimental-strip-types db/migrate.ts
   ```

5. **Run in development**

   ```bash
   npm run dev
   ```

   The backend runs on `:3001` and the frontend on `:5173`. Open
   [http://localhost:5173](http://localhost:5173).

### Environment Variables

| Variable | Description |
|---|---|
| `DB_HOST` | MySQL host (default: `localhost`) |
| `DB_PORT` | MySQL port (default: `3306`) |
| `DB_USER` | MySQL user |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | Database name (default: `via`) |
| `PORT` | Backend port (default: `3001`) |
| `CLIENT_URL` | Frontend origin for CORS |
| `SERVER_URL` | Backend URL |
| `AZURE_CLIENT_ID` | Azure AD app client ID (UIUC NetID login) |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_CLIENT_SECRET` | Azure AD client secret |
| `JWT_SECRET` | Secret for signing JWTs |
| `SESSION_SECRET` | Secret for Express sessions |

Azure AD variables are only required if you want UIUC NetID SSO. The `passport-local` fallback (username/password) works without them.

## Project Structure

```
client/        Svelte 5 frontend
server/
  app.js       Express app setup
  index.js     Server entry point
  controllers/ Route handlers
  db/          Database layer (mysql2 and Drizzle over one pool, plus migrations)
  middleware/  Auth, error handling
  routes/      Express routers
  services/    Business logic
  scripts/     DB seed / migration scripts
docs/          Deployment, development, SEO, and design specs
```

## Running Tests

```bash
cd server && npm test
cd client && npm test
```

## Deployment

The stack is fully self-contained via Docker Compose. MySQL, the Node/Svelte server and the
Discord bot run as sibling services, with no external database required. The bot's image is
built from a checkout of
[viaillinois-bot](https://github.com/max-bromberg/viaillinois-bot) beside this one, at the
tag pinned in `deploy/bot-release`, and one cutover deploys both services.

```bash
cp .env.example .env   # fill in DB_USER, DB_PASSWORD, secrets, URLs
docker compose up -d
```

Production deploys go through the cutover script, which backs up the database, proves the
backup restores, applies migrations and rolls back if the new build does not come up
healthy. See [docs/deployment.md](docs/deployment.md) for the full procedure, the settings
it accepts, and its current limitations.

```bash
scripts/cutover.sh v0.5.1
```

MySQL data is persisted in a named Docker volume (`db_data`), and the schema comes from the
migrations under `server/db/migrations`, which the cutover applies. To seed initial data
after the containers are healthy:

```bash
docker compose exec via node scripts/seed.js
```

## Releases

The whole platform carries one version number, held in the root `package.json` and mirrored
into the server and client manifests. `scripts/bump-version.sh <patch|minor|major>` bumps
all three, opens `CHANGELOG.md` for the release note, and creates an annotated tag. A
running server reports its version at `GET /health`, alongside the applied migration
version, so you can ask a deployment what it is rather than inferring it from a deploy log.
Every release passes the gate in `.github/workflows/gate.yml` first. See
[docs/deployment.md](docs/deployment.md) for the full procedure and [CHANGELOG.md](CHANGELOG.md)
for what shipped when.

## Contributing

Pull requests are welcome. Open an issue first for significant changes so we can discuss the approach before you invest time in it.

## License

MIT, see [LICENSE](LICENSE).

Copyright (c) 2025 Max Bromberg. VIA is free to use, modify and redistribute under the MIT
terms, provided the copyright notice and the license text travel with it.

<div align="center">

Copyright (c) 2025 Max Bromberg

</div>
