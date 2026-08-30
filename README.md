# VIA: Virtually Integrated Agenda

A centralized event management platform for UIUC's ECE department Registered Student Organizations (RSOs).

VIA gives students a single place to discover events across all ECE RSOs, and gives RSO admins a logistics dashboard to create and manage those events without the chaos of scattered email lists, Discord servers, and Instagram posts.

## Features

- **Public event feed**: browse and filter upcoming ECE RSO events
- **Logistics dashboard**: RSO admins create, edit, and manage events
- **UIUC NetID login**: authenticate with your Illinois credentials via Azure AD OIDC
- **Conflict detection**: surface scheduling conflicts before they happen
- **QR codes**: per-event QR codes for check-in

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Svelte 5, Vite, Tailwind CSS, shadcn-svelte |
| Backend | Node.js (ESM), Express 5 |
| Database | MySQL 8.0+ |
| Auth | passport-azure-ad (UIUC NetID / Azure AD OIDC), passport-local fallback |
| Production | GCP Cloud SQL, Docker |

## Getting Started

### Prerequisites

- Node.js 20+
- MySQL 8.0+

### Setup

1. **Clone the repo**

   ```bash
   git clone <repo-url>
   cd via
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your MySQL credentials and (optionally) Azure AD app registration details for UIUC NetID login. See [Environment Variables](#environment-variables) below.

3. **Install dependencies**

   ```bash
   npm install          # root
   cd server && npm install
   cd ../client && npm install
   ```

4. **Create the database**

   The schema is built by running the migrations, not by loading a schema file.

   ```bash
   mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS via"
   cd server && node --experimental-strip-types db/migrate.ts
   ```

5. **Run in development**

   ```bash
   # Terminal 1, backend (runs on :3001)
   cd server && npm run dev

   # Terminal 2, frontend (runs on :5173)
   cd client && npm run dev
   ```

   Open [http://localhost:5173](http://localhost:5173).

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
```

## Running Tests

```bash
cd server && npm test
cd client && npm test
```

## Deployment

The stack is fully self-contained via Docker Compose. MySQL and the Node/Svelte server run as sibling services, with no external database required.

```bash
cp .env.example .env   # fill in DB_USER, DB_PASSWORD, secrets, URLs
docker compose up -d
```

Production deploys go through the cutover script, which backs up the database, proves the
backup restores, applies migrations and rolls back if the new build does not come up
healthy. See [docs/deployment.md](docs/deployment.md) for the full procedure, the settings
it accepts, and its current limitations.

```bash
scripts/cutover.sh v0.2.0
```

MySQL data is persisted in a named Docker volume (`db_data`), and the schema comes from the
migrations under `server/db/migrations`, which the cutover applies. To seed initial data
after the containers are healthy:

```bash
docker compose exec via node scripts/seed.js
```

## Contributing

Pull requests are welcome. Open an issue first for significant changes so we can discuss the approach before you invest time in it.

## License

[MIT](LICENSE)
