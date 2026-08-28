import { drizzle } from 'drizzle-orm/mysql2';
import pool from './pool.js';

/**
 * Drizzle client built over the existing mysql2 pool.
 *
 * There is exactly one connection pool in this process. Raw `query()` calls from
 * db/queries/*.js and Drizzle calls both run over it, which is what allows the
 * conversion away from raw SQL to proceed one query at a time.
 */
export const db = drizzle(pool);

export default db;
