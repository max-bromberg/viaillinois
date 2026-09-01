import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8');

/**
 * Return the body of a nested block, addressed by its key path.
 *
 * This is a deliberately small reader rather than a YAML parser, because the
 * repository has no YAML dependency and these assertions only need to see
 * whether a few specific lines are present.
 */
function section(text, keys) {
  let lines = text.split('\n');
  let indent = 0;
  for (const key of keys) {
    const head = ' '.repeat(indent) + key + ':';
    const start = lines.findIndex((line) => line.startsWith(head));
    if (start === -1) return null;
    const rest = lines.slice(start + 1);
    const end = rest.findIndex(
      (line) => line.trim() !== '' && !line.startsWith(' '.repeat(indent + 1)),
    );
    lines = end === -1 ? rest : rest.slice(0, end);
    indent += 2;
  }
  return lines.join('\n');
}

/**
 * The root compose file runs production and nothing else. No test and no gate
 * job brings it up, so these assertions are the only thing standing between it
 * and silent drift. The deployed copy diverged from this file once already,
 * which is what these three checks are here to catch.
 */
describe('docker-compose.yml', () => {
  it('does not mount a schema file into docker-entrypoint-initdb.d', () => {
    // A boot time schema mount runs only on an empty data directory, which is
    // how the production schema drifted out of the repository before the
    // migration system existed.
    expect(compose).not.toContain('docker-entrypoint-initdb.d');
  });

  it('mounts the host backup directory into the application container', () => {
    // Without this, the cutover writes its verified backup inside a container
    // that is about to be replaced, and the rollback has nothing to restore.
    expect(section(compose, ['services', 'via', 'volumes'])).toContain(':/backups');
  });

  /**
   * VIA serves one campus, so both containers keep that campus's clock. The
   * database decides what CURRENT_TIMESTAMP writes into a column default, and
   * the application decides what a Date written by a poller reads as. Left on
   * the image default of UTC, those two stamps sit five or six hours away from
   * the event times stored beside them.
   */
  it('runs both containers on campus time', () => {
    expect(section(compose, ['services', 'db', 'environment'])).toContain('TZ: America/Chicago');
    expect(section(compose, ['services', 'via', 'environment'])).toContain('TZ: America/Chicago');
  });

  it('joins the external network that the reverse proxy reaches it on', () => {
    // The proxy in front of production resolves the application by service
    // name on this network. Publishing port 3000 is not a substitute: the
    // health check would still pass while the public site was unreachable.
    const network = section(compose, ['networks', 'default']);
    expect(network).toContain('external: true');
    expect(network).toContain('name: internal');
    expect(section(compose, ['services', 'via', 'networks'])).toContain('- default');
  });

  it('keeps the database off the shared network', () => {
    // The shared network carries every stack on the host, and Compose gives
    // each service the alias of its own name there. Three stacks run a service
    // called db, so that name resolves to three servers and every connection
    // is a draw between them. The database has no reason to be reachable from
    // the other stacks at all, so it stays on a network private to this one.
    const networks = section(compose, ['services', 'db', 'networks']);
    expect(networks).toContain('via_internal');
    expect(networks).not.toContain('default');
  });

  it('gives the database a name that no other stack answers to', () => {
    expect(section(compose, ['services', 'db', 'networks'])).toContain('via-db');
    expect(section(compose, ['services', 'via', 'environment'])).toContain('DB_HOST: via-db');
  });

  it('puts the application on both networks', () => {
    // The proxy reaches the application on the shared network, and the
    // application reaches the database on the private one.
    const networks = section(compose, ['services', 'via', 'networks']);
    expect(networks).toContain('- default');
    expect(networks).toContain('- via_internal');
    expect(section(compose, ['networks', 'via_internal'])).not.toBeNull();
  });
});

/**
 * The cutover refuses to run on a dirty working tree, because deploying from
 * one would ship something other than the tag that was tested.
 */
describe('the deployment checkout', () => {
  it('ignores the default backup directory', () => {
    // BACKUP_DIR defaults to ./backups, which puts the dumps inside the
    // deployment checkout. Tracked, they make the tree dirty the moment the
    // first backup lands, and every deploy after that has to be cleared by
    // hand before the cutover will start.
    const ignored = spawnSync('git', ['check-ignore', '-q', 'backups/via-example.sql'], {
      cwd: root,
    });
    expect(ignored.status).toBe(0);
  });
});
