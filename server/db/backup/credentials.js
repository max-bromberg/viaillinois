import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Write a short lived client options file holding the credentials.
 *
 * The password never goes on a command line. Arguments are world readable
 * through ps and /proc on the host, and this code runs against production
 * during a cutover. The file is created with owner only permissions inside a
 * private temporary directory that the caller removes afterwards.
 */
export async function writeDefaultsFile(dir, config) {
  const path = join(dir, 'client.cnf');
  await writeFile(path, [
    '[client]',
    `host=${config.host}`,
    `port=${config.port}`,
    `user=${config.user}`,
    `password=${config.password}`,
    '',
  ].join('\n'), { mode: 0o600 });
  return path;
}
