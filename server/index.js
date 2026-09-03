import 'dotenv/config';
import app from './app.js';
import pool from './db/pool.js';
import facilitiesPoller from './services/facilitiesPoller.js';
import coursesPoller from './services/coursesPoller.js';
import astraPoller from './services/astraPoller.js';
import { pollersEnabled } from './lib/pollerConfig.js';
import { startDenialRecorder, stopDenialRecorder } from './services/denialRecorder.js';

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
  startDenialRecorder();
});

// Node's defaults let a connection hold a socket open for a long time saying
// very little, which is free for the client and not free for the server.
server.requestTimeout = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10);
server.headersTimeout = parseInt(process.env.HEADERS_TIMEOUT_MS || '35000', 10);
// Deliberately above Cloudflare's idle timeout, so the origin is never the
// side that closes a connection the edge still believes is open. When it is,
// the reader sees a 502 that nothing in the logs explains.
server.keepAliveTimeout = parseInt(process.env.KEEPALIVE_TIMEOUT_MS || '65000', 10);

async function shutdown() {
  // Hard-kill after 3 s so CTRL+C never hangs
  setTimeout(() => process.exit(0), 3000).unref();
  server.close(async () => {
    await Promise.all([
      facilitiesPoller.stop(), coursesPoller.stop(), astraPoller.stop(), stopDenialRecorder(),
    ]);
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
