import express from 'express';
import cors from 'cors';
import { securityHeaders } from './middleware/securityHeaders.js';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { passport, attachUser } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRouter     from './routes/auth.js';
import eventsRouter   from './routes/events.js';
import rsosRouter     from './routes/rsos.js';
import usersRouter    from './routes/users.js';
import venuesRouter   from './routes/venues.js';
import seoRouter      from './routes/seo.js';
import { createHtmlShellHandler } from './middleware/htmlShell.js';
import midtermsRouter from './routes/midterms.js';
import kioskRouter    from './routes/kiosk.js';
import adminRouter    from './routes/admin.js';
import schedulerRouter from './routes/scheduler.js';
import { join, dirname, sep } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import { query } from './db/pool.js';
import { currentVersion } from './db/migrate.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read once at module load, because the version cannot change while the
// process is running.
const APP_VERSION = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
).version;

const app = express();

if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

// Nothing is gained by telling the world which framework this is.
app.disable('x-powered-by');
app.use(securityHeaders);

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(morgan('dev'));
// A calendar file arrives as text in the request body, and a year of events
// for an active RSO exports well past the 100kb that body-parser allows by
// default. These two routes get room to work and everything else keeps the
// smaller limit, so raising it does not widen the surface of the whole API.
// The importer caps the number of entries separately, so a large body still
// cannot turn into unbounded work.
const CALENDAR_BODY_LIMIT = '2mb';
app.use('/api/v1/events/import', express.json({ limit: CALENDAR_BODY_LIMIT }));
app.use('/api/v1/midterms/import', express.json({ limit: CALENDAR_BODY_LIMIT }));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_session_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', sameSite: 'lax' },
}));
app.use(passport.initialize());
app.use(attachUser);

/**
 * Readiness, not liveness. The cutover script gates on this, so it has to fail
 * when the process is running but cannot serve traffic: no database, or a
 * database that has never been migrated.
 */
app.get('/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    const migrationVersion = await currentVersion();
    if (migrationVersion === null) {
      return res.status(503).json({ status: 'unavailable', error: 'no migrations applied' });
    }
    res.json({ status: 'ok', version: APP_VERSION, migrationVersion });
  } catch (err) {
    // The reason stays in the logs. A database error message carries the host,
    // the user and driver internals, and this endpoint answers anyone.
    console.error('health check failed:', err.message);
    res.status(503).json({ status: 'unavailable', error: 'database unavailable' });
  }
});

app.use('/auth',              authRouter);
app.use('/api/v1/events',     eventsRouter);
app.use('/api/v1/rsos',       rsosRouter);
app.use('/api/v1/users',      usersRouter);
app.use('/api/v1/venues',     venuesRouter);

// Ahead of the static handler, so these are generated rather than served from
// the bundle, where they were stale and used relative addresses.
app.use(seoRouter);
app.use('/api/v1/midterms',   midtermsRouter);
app.use('/api/v1/kiosk',      kioskRouter);
app.use('/api/v1/admin',      adminRouter);
app.use('/api/v1/scheduler',  schedulerRouter);

app.use(errorHandler);

// Serve built Svelte frontend in production
const distPath = join(__dirname, '../client/dist');
if (process.env.NODE_ENV === 'production' && existsSync(distPath)) {
  app.use(express.static(distPath, {
    // index.html is never served from here. It goes through the shell handler
    // below, which fills in this page's title, description and structured data.
    index: false,
    setHeaders(res, filePath) {
      // Vite puts a content hash in the name of everything under assets, so
      // those can be cached forever. Anything else is served by a stable name
      // and has to be revalidated or a logo change would never reach anyone.
      res.setHeader(
        'Cache-Control',
        filePath.includes(`${sep}assets${sep}`)
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=3600'
      );
    },
  }));
  app.get('/{*path}', createHtmlShellHandler(distPath));
}

export default app;
