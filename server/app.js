import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { passport, attachUser } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRouter     from './routes/auth.js';
import eventsRouter   from './routes/events.js';
import rsosRouter     from './routes/rsos.js';
import usersRouter    from './routes/users.js';
import venuesRouter   from './routes/venues.js';
import midtermsRouter from './routes/midterms.js';
import kioskRouter    from './routes/kiosk.js';
import adminRouter    from './routes/admin.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());
app.use(attachUser);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/auth',              authRouter);
app.use('/api/v1/events',     eventsRouter);
app.use('/api/v1/rsos',       rsosRouter);
app.use('/api/v1/users',      usersRouter);
app.use('/api/v1/venues',     venuesRouter);
app.use('/api/v1/midterms',   midtermsRouter);
app.use('/api/v1/kiosk',      kioskRouter);
app.use('/api/v1/admin',      adminRouter);

app.use(errorHandler);

// Serve built Svelte frontend in production
const distPath = join(__dirname, '../client/dist');
if (process.env.NODE_ENV === 'production' && existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('/{*path}', (_req, res) => res.sendFile(join(distPath, 'index.html')));
}

export default app;
