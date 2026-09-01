import 'dotenv/config';
import app from './app.js';
import pool from './db/pool.js';
import facilitiesPoller from './services/facilitiesPoller.js';
import coursesPoller from './services/coursesPoller.js';
import astraPoller from './services/astraPoller.js';
import { pollersEnabled } from './lib/pollerConfig.js';

if (process.env.NODE_ENV === 'production') {
  const required = ['JWT_SECRET', 'SESSION_SECRET', 'DB_PASSWORD', 'DB_USER'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`FATAL: missing required env vars in production: ${missing.join(', ')}`);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`VIA server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  if (pollersEnabled(process.env)) {
    facilitiesPoller.start();
    coursesPoller.start();
    astraPoller.start();
  } else {
    console.log('pollers disabled by POLLERS_ENABLED');
  }
});

async function shutdown() {
  // Hard-kill after 3 s so CTRL+C never hangs
  setTimeout(() => process.exit(0), 3000).unref();
  server.close(async () => {
    await Promise.all([facilitiesPoller.stop(), coursesPoller.stop(), astraPoller.stop()]);
    pool.end().then(() => process.exit(0)).catch(() => process.exit(1));
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
