/**
 * Connection settings for backup, verification and restore.
 *
 * These steps need more than the application account has. Verification creates
 * a scratch database and compares row counts in it, and restore drops and
 * recreates the application database. The application user is scoped to its
 * own database and can do neither.
 *
 * The default is root with the database password, because that is exactly how
 * docker-compose.yml provisions the database container: MYSQL_ROOT_PASSWORD
 * and MYSQL_PASSWORD are both DB_PASSWORD. A deployment that prefers a
 * dedicated account sets DB_ADMIN_USER and DB_ADMIN_PASSWORD instead.
 */
export function adminConfigFromEnv() {
  return {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_ADMIN_USER     || 'root',
    password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'via',
  };
}
