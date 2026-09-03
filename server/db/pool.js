import mysql from 'mysql2/promise';
import 'dotenv/config';

if (process.env.NODE_ENV === 'production' && !process.env.DB_PASSWORD) {
  console.warn('WARNING: DB_PASSWORD is not set. This is unsafe in production.');
}

const pool = mysql.createPool({
  host:             process.env.DB_HOST     || 'localhost',
  port:             parseInt(process.env.DB_PORT || '3306'),
  user:             process.env.DB_USER     || 'root',
  password:         process.env.DB_PASSWORD || '',
  database:         process.env.DB_NAME     || 'via',
  waitForConnections: true,
  connectionLimit:  10,
  // Callers used to queue for a connection without bound, which is where the
  // memory went under load: each one held a socket and a half built response
  // while it waited, and the kernel chose the victim rather than the process
  // choosing what to shed. A full queue now rejects at once, and the error
  // handler turns that rejection into an honest 503.
  queueLimit:       parseInt(process.env.DB_QUEUE_LIMIT || '50', 10),
  connectTimeout:   parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10),
  namedPlaceholders: true,
  // Datetime columns hold campus wall clock, so they are read back as the
  // strings they are. The driver would otherwise parse each one into a Date
  // using the zone this process happens to run in, and JSON would then publish
  // that as UTC, moving every event by the difference between the two.
  dateStrings: true,
});

// How many callers are waiting on the driver right now. mysql2 keeps its own
// queue private, and it has changed shape between releases, so this module
// counts for itself rather than reaching inside.
let waiting = 0;

/** Callers currently waiting on a database connection. */
export function waitingCount() {
  return waiting;
}

/**
 * Execute a parameterized SQL query.
 * @param {string} sql
 * @param {Array|object} params
 * @returns {Promise<Array>}
 */
export async function query(sql, params = []) {
  waiting += 1;
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } finally {
    waiting -= 1;
  }
}

export default pool;
