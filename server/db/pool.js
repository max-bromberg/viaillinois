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
  namedPlaceholders: true,
});

/**
 * Execute a parameterized SQL query.
 * @param {string} sql
 * @param {Array|object} params
 * @returns {Promise<Array>}
 */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

export default pool;
