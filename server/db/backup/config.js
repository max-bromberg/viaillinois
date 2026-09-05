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
export function adminConfigFromEnv(overrides = {}) {
  return {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_ADMIN_USER     || 'root',
    password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD || '',
    database: overrides.database || process.env.DB_NAME || 'via',
  };
}

/**
 * The database a command line names with --database, or null when it names
 * none and the environment decides.
 *
 * The stack holds two databases on one server, the web platform's and the
 * Discord bot's, and the cutover backs up both by running the same scripts
 * twice. A flag with nothing after it throws rather than falling back, because
 * the quiet fallback would take a backup of the web platform, name it the
 * bot's, and satisfy the cutover.
 *
 * @param {string[]} args
 * @returns {string | null}
 */
export function databaseArgument(args) {
  const index = args.indexOf('--database');
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error('--database needs the name of a database after it');
  }
  return value;
}
