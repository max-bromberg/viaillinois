import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { securityHeaders } from './middleware/securityHeaders.js';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { passport, attachUser } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createProductionLoadShed } from './middleware/loadShed.js';
import { clientIp, trustedProxyHops } from './lib/clientIdentity.js';
import { recordDenial } from './services/denialRecorder.js';
import { createProductionPublicApiBudget } from './middleware/publicApiBudget.js';
import { campusTimeJson } from './middleware/campusTime.js';
import { privateByDefault, publicFor, cacheControlForStaticFile } from './middleware/caching.js';
import authRouter     from './routes/auth.js';
import eventsRouter   from './routes/events.js';
import rsosRouter     from './routes/rsos.js';
import usersRouter    from './routes/users.js';
import linkRouter     from './routes/link.js';
import venuesRouter   from './routes/venues.js';
import seoRouter      from './routes/seo.js';
import { createHtmlShellHandler } from './middleware/htmlShell.js';
import midtermsRouter from './routes/midterms.js';
import kioskRouter    from './routes/kiosk.js';
import adminRouter    from './routes/admin.js';
import schedulerRouter from './routes/scheduler.js';
import { createInternalRouter } from './routes/internal/index.js';
import semesterRouter  from './routes/semester.js';
import personalCalendarRouter from './routes/personalCalendar.js';
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

// Cloudflare, then Nginx Proxy Manager, is two hops. At the previous value of
// one, Express resolved req.ip to the Cloudflare edge address, which put every
// visitor behind a given edge into one bucket of the login limiter.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', trustedProxyHops());
}

// Nothing is gained by telling the world which framework this is.
app.disable('x-powered-by');
app.use(securityHeaders);

// Who is asking, resolved once and read by everything downstream. This sits
// early because it is trivially cheap and the login limiter reads it.
app.use((req, _res, next) => { req.clientIp = clientIp(req); next(); });

// The CDN fetches from here compressed when the origin offers it, so every
// cache miss travels a fraction of the bytes, and so does every response the
// CDN does not cache at all. JSON full of repeated field names and the HTML
// document are both mostly air.
app.use(compression());

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
// The coloured development format is for a terminal somebody is watching. In
// production the log is read by a machine, and a request for a hashed asset,
// which the CDN answers without asking us anyway, is not worth a line.
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  skip: (req, res) => process.env.NODE_ENV === 'production'
    && res.statusCode < 400
    && req.path.startsWith('/assets/'),
}));
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

// After attachUser, because the tiers above distinguish a signed in board
// member from an anonymous reader, and req.user does not exist before it.
// attachUser reads a cookie and verifies a JWT with no database access, so
// the cost of shedding this late is negligible.
app.use(createProductionLoadShed({ onDenied: recordDenial }));

// Every time this API publishes leaves with the campus offset on it. Mounted
// once here rather than per route, because a route that forgot was the whole
// of the inconsistency this replaces.
app.use(campusTimeJson);

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

// Nothing the API answers is kept by a shared cache unless the route says
// otherwise. Most of it depends on who is asking, and the cost of getting that
// wrong is one person's answer handed to somebody else.
app.use('/api/v1', privateByDefault);
// Anonymous callers only, and generous enough that a reader never meets it.
app.use('/api/v1', createProductionPublicApiBudget({ onDenied: recordDenial }));
app.use('/auth', privateByDefault);

app.use('/auth',              authRouter);
app.use('/api/v1/events',     eventsRouter);
app.use('/api/v1/rsos',       rsosRouter);
app.use('/api/v1/users',      usersRouter);
// What the Discord link page reads about the session it was opened for.
app.use('/api/v1/link',       linkRouter);
app.use('/api/v1/venues',     venuesRouter);

// Ahead of the static handler, so these are generated rather than served from
// the bundle, where they were stale and used relative addresses.
app.use(seoRouter);
app.use('/api/v1/midterms',   midtermsRouter);
// The same answer for everybody, and a lobby screen asks for it over and over.
app.use('/api/v1/kiosk',      publicFor({ edgeSeconds: 30 }), kioskRouter);
app.use('/api/v1/admin',      adminRouter);
app.use('/api/v1/scheduler',  schedulerRouter);
// The Discord bot's door. Off the /api/v1 prefix on purpose, so the public
// budget mounted there never counts the bot, and behind its own guard, so
// nothing but the bot gets in.
app.use('/internal/v1', createInternalRouter({ version: APP_VERSION, onDenied: recordDenial }));
// A term calendar changes once a year, and every form and search reads it.
app.use('/api/v1/semester',   publicFor({ browserSeconds: 300, edgeSeconds: 3600 }), semesterRouter);
// A person's own calendar, fetched by a calendar application on their phone,
// which has no cookie and no service token and holds only the address. Off the
// /api/v1 prefix because it is a file somebody subscribes to rather than part
// of the API, and it sets its own private caching, so no shared cache keeps it.
app.use('/calendar/personal', personalCalendarRouter);

app.use(errorHandler);

// Serve built Svelte frontend in production
const distPath = join(__dirname, '../client/dist');
if (process.env.NODE_ENV === 'production' && existsSync(distPath)) {
  app.use(express.static(distPath, {
    // index.html is never served from here. It goes through the shell handler
    // below, which fills in this page's title, description and structured data.
    index: false,
    setHeaders(res, filePath) {
      res.setHeader('Cache-Control', cacheControlForStaticFile(filePath));
    },
  }));
  app.get('/{*path}', createHtmlShellHandler(distPath));
}

export default app;
