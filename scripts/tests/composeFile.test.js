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
  it('mounts nothing but the bot database initialisation into docker-entrypoint-initdb.d', () => {
    // A boot time mount runs only on an empty data directory, which is how the
    // production schema drifted out of the repository before the migration
    // system existed. The one thing mounted there now creates the bot's
    // database and its account, which no migration runner can do for itself,
    // and it creates no table. Every table on either database still comes from
    // a migration.
    const volumes = section(compose, ['services', 'db', 'volumes']);
    const mounts = volumes
      .split('\n')
      .filter((line) => line.includes('docker-entrypoint-initdb.d'))
      .map((line) => line.trim());
    expect(mounts).toEqual(['- ./server/db/init:/docker-entrypoint-initdb.d:ro']);
    expect(compose).not.toContain('migrations:/docker-entrypoint-initdb.d');
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
    expect(networks).toContain('via_internal:');
    expect(section(compose, ['networks', 'via_internal'])).not.toBeNull();
  });

  it('answers to a name of its own on the private network, which is where the bot reaches it', () => {
    // The service name is resolved on the shared network too, where another
    // stack could one day run a service called via, which is the collision
    // that forced the via-db alias on the database.
    const networks = section(compose, ['services', 'via', 'networks']);
    expect(networks).toContain('- via-platform');
    expect(section(compose, ['services', 'via-bot', 'environment'])).toContain('VIA_INTERNAL_URL: http://via-platform:3001');
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

/**
 * The VPS is shared with other applications belonging to the same operator.
 * Without limits, a runaway VIA is a runaway host, and the kernel picks its
 * victim without caring which container caused the problem. Limits here mean
 * the worst case is that VIA alone suffers.
 */
describe('container resource limits', () => {
  it('caps what the application may take', () => {
    const via = section(compose, ['services', 'via']);
    expect(via).toContain('mem_limit: 1g');
    expect(via).toContain('cpus: 2.0');
  });

  it('caps what the database may take', () => {
    const db = section(compose, ['services', 'db']);
    expect(db).toContain('mem_limit: 2g');
    expect(db).toContain('cpus: 2.0');
  });

  it('sizes the buffer pool to sit inside the database limit', () => {
    // The default is sized against the host's 10 GB rather than against the
    // container's 2 GB, which gets the container killed rather than slowed.
    expect(section(compose, ['services', 'db'])).toContain('--innodb-buffer-pool-size=1G');
  });
});

/**
 * The entries declared in a block, one per line, with comments dropped and a
 * leading list dash removed.
 */
function keysOf(block) {
  return (block ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.replace(/^- /, ''));
}

/**
 * The Discord bot is a third container in this stack rather than a deployment
 * of its own. It is built from a checkout of its repository beside this one,
 * at the tag pinned in deploy/bot-release, and one cutover deploys both.
 */
describe('the via-bot service', () => {
  const bot = section(compose, ['services', 'via-bot']);
  const environment = section(compose, ['services', 'via-bot', 'environment']);

  it('is built from the sibling checkout the cutover pins', () => {
    expect(bot).not.toBeNull();
    // The same setting the cutover reads, so moving the checkout moves it for
    // both. The cutover exports it, and compose falls back to the same default.
    expect(section(compose, ['services', 'via-bot', 'build'])).toContain(
      'context: ${BOT_CHECKOUT:-../viaillinois-bot}',
    );
  });

  it('is on both networks', () => {
    // It reaches the database on the private network, and it reaches the web
    // platform's internal service API by service name on the shared one.
    const networks = section(compose, ['services', 'via-bot', 'networks']);
    expect(networks).toContain('- default');
    expect(networks).toContain('- via_internal');
  });

  it('caps what it may take and comes back after a restart', () => {
    expect(bot).toContain('mem_limit: 512m');
    expect(bot).toContain('cpus: 1.0');
    expect(bot).toContain('restart: unless-stopped');
  });

  it('runs on campus time', () => {
    expect(environment).toContain('TZ: America/Chicago');
  });

  it('waits for the database to be healthy and for the web platform to start', () => {
    // Its own health answer is unavailable until the web platform answers, so
    // starting it first only means starting it into a failing health check.
    const dependsOn = section(compose, ['services', 'via-bot', 'depends_on']);
    expect(section(compose, ['services', 'via-bot', 'depends_on', 'db'])).toContain(
      'condition: service_healthy',
    );
    expect(dependsOn).toContain('via:');
    expect(section(compose, ['services', 'via-bot', 'depends_on', 'via'])).toContain(
      'condition: service_started',
    );
  });

  it('publishes one port, which is the health endpoint the cutover gates on', () => {
    const ports = keysOf(section(compose, ['services', 'via-bot', 'ports']));
    expect(ports).toEqual(['"127.0.0.1:${BOT_HEALTH_PORT:-3002}:3002"']);
  });

  it('reaches the web platform inside the stack and links to it outside', () => {
    expect(environment).toContain('VIA_INTERNAL_URL: http://via-platform:3001');
    expect(environment).toContain('VIA_PUBLIC_URL: ${CLIENT_URL}');
  });

  it('is given every variable the bot refuses to start without', () => {
    for (const name of [
      'DISCORD_TOKEN',
      'DISCORD_APPLICATION_ID',
      'DISCORD_PUBLIC_KEY',
      'VIA_INTERNAL_URL',
      'BOT_SERVICE_TOKEN',
      'DB_HOST',
      'DB_PORT',
      'BOT_DB_USER',
      'BOT_DB_PASSWORD',
      'BOT_DB_NAME',
    ]) {
      expect(keysOf(environment).some((line) => line.startsWith(`${name}:`))).toBe(true);
    }
    expect(environment).toContain('DB_HOST: via-db');
  });

  it('never carries the credentials belonging to the web platform', () => {
    // The bot has its own account on its own database, and it reads and writes
    // everything belonging to the web platform through the internal service
    // API. An account or a signing secret in this container would be a way
    // around that boundary, and a leak of this container would be a leak of
    // the web platform.
    const names = keysOf(environment).map((line) => line.split(':')[0]);
    expect(names).not.toContain('DB_USER');
    expect(names).not.toContain('DB_PASSWORD');
    expect(names).not.toContain('DB_ADMIN_USER');
    expect(names).not.toContain('DB_ADMIN_PASSWORD');
    expect(names).not.toContain('JWT_SECRET');
    expect(names).not.toContain('SESSION_SECRET');
    expect(environment).not.toContain('${DB_PASSWORD}');
    expect(environment).not.toContain('${JWT_SECRET}');
  });
});

/**
 * Both published ports are for the cutover's health checks, which run on the
 * host itself. The reverse proxy reaches the website by service name on the
 * shared network instead, so neither port needs an address the rest of the
 * world can reach. A port published on every interface would put the internal
 * service API, and the bot's health endpoint, on the host's public address.
 */
describe('the published ports', () => {
  it('binds the website port to the loopback address only', () => {
    const ports = keysOf(section(compose, ['services', 'via', 'ports']));
    expect(ports).toEqual(['"127.0.0.1:${VIA_PORT:-3000}:3001"']);
  });

  it('binds every published port in the stack to the loopback address', () => {
    const published = compose
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^- "\d|^- "\$\{|^- "127\./.test(line) && /:\d+"$/.test(line));
    expect(published.length).toBeGreaterThan(0);
    for (const line of published) expect(line).toContain('"127.0.0.1:');
  });
});

/**
 * The web platform's side of the bot: the token that lets the bot through the
 * internal service API door, and the Discord application the link flow uses.
 */
describe('the web platform service and the bot', () => {
  const environment = section(compose, ['services', 'via', 'environment']);

  it('is given the settings that decide how long the outbox is kept', () => {
    // The pruner reads both from the environment. Absent from the compose
    // file, they can only be changed by editing this repository, and the
    // defaults compiled into the service are the only values production has.
    expect(keysOf(environment)).toContain('OUTBOX_RETENTION_DAYS: ${OUTBOX_RETENTION_DAYS:-30}');
    expect(keysOf(environment))
      .toContain('OUTBOX_PRUNE_INTERVAL_MS: ${OUTBOX_PRUNE_INTERVAL_MS:-3600000}');
  });

  it('is given the bot service token and the Discord link settings', () => {
    for (const name of [
      'BOT_SERVICE_TOKEN',
      'DISCORD_CLIENT_ID',
      'DISCORD_CLIENT_SECRET',
      'DISCORD_LINK_KEY',
      'DISCORD_INTEREST_SALT',
    ]) {
      expect(keysOf(environment).some((line) => line.startsWith(`${name}:`))).toBe(true);
    }
  });
});

/**
 * MySQL runs the initialisation directory only on an empty data directory, so
 * this creates the bot's database and account on a host that is starting from
 * nothing. A database that already exists gets the same statements by hand,
 * once, and docs/deployment.md carries them.
 */
describe('the bot database', () => {
  it('is created on first start by a script the database service mounts', () => {
    const volumes = section(compose, ['services', 'db', 'volumes']);
    expect(volumes).toContain('./server/db/init:/docker-entrypoint-initdb.d:ro');
  });

  it('gives that script the account it has to create', () => {
    const environment = section(compose, ['services', 'db', 'environment']);
    expect(environment).toContain('BOT_DB_USER: ${BOT_DB_USER:-via_bot}');
    expect(environment).toContain('BOT_DB_PASSWORD: ${BOT_DB_PASSWORD:-}');
    expect(environment).toContain('BOT_DB_NAME: ${BOT_DB_NAME:-via_bot}');
  });
});

/**
 * The gate's database job runs the same initialisation script the production
 * database runs, against the throwaway container, so a script that does not
 * work stops a pull request rather than a deploy. The container keeps its data
 * in tmpfs, so the script runs on every start rather than once.
 */
describe('docker-compose.test.yml', () => {
  const testCompose = readFileSync(join(root, 'docker-compose.test.yml'), 'utf8');

  it('mounts the initialisation script the same way production does', () => {
    expect(section(testCompose, ['services', 'test-db', 'volumes'])).toContain(
      './server/db/init:/docker-entrypoint-initdb.d:ro',
    );
  });

  it('gives it the account that tests then check the reach of', () => {
    const environment = section(testCompose, ['services', 'test-db', 'environment']);
    expect(environment).toContain('BOT_DB_USER: via_bot');
    expect(environment).toContain('BOT_DB_PASSWORD: test_bot_pw');
    expect(environment).toContain('BOT_DB_NAME: via_bot');
  });
});
