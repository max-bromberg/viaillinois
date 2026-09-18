import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = join(import.meta.dirname, '..', '..');

/**
 * The cutover is the only supported way to deploy, and it now deploys two
 * services from two checkouts in one maintenance window. Nothing here talks to
 * docker: the tests run the real script with stub `docker` and `curl` commands
 * ahead of the real ones on PATH, and then read what the script asked them to
 * do and in what order. That is what makes the ordering testable, and the
 * ordering is the whole design of the script.
 */

const DOCKER_STUB = `#!/usr/bin/env bash
echo "docker $*" >> "$STUB_LOG"
if [ -n "\${DOCKER_FAIL_MATCH:-}" ] && [[ "$*" == *"\${DOCKER_FAIL_MATCH}"* ]]; then
  echo "stub docker failing on purpose" >&2
  exit 1
fi
# The backup script prints the path it wrote, and the cutover captures it.
if [[ "$*" == *backupCli.js* ]]; then
  if [[ "$*" == *"--database"* ]]; then
    printf '/backups/via_bot-stamp.sql'
  else
    printf '/backups/via-stamp.sql'
  fi
fi
exit 0
`;

const CURL_STUB = `#!/usr/bin/env bash
url="\${@: -1}"
echo "curl $url" >> "$STUB_LOG"
if [ -n "\${CURL_UNHEALTHY:-}" ] && [[ "$url" == *"\${CURL_UNHEALTHY}"* ]]; then
  exit 22
fi
case "$url" in
  *3002*) echo '{"status":"ok","version":"0.1.0","gateway":true}' ;;
  *)      echo '{"status":"ok","version":"1.0.0"}' ;;
esac
exit 0
`;

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

/** A git repository with two tags, sitting on the older one as a server does. */
async function scratchRepo(dir, files, tags, laterFiles = {}) {
  await mkdir(dir, { recursive: true });
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(join(dir, path, '..'), { recursive: true });
    await writeFile(join(dir, path), contents, { mode: path.endsWith('.sh') ? 0o755 : 0o644 });
  }
  git(dir, 'add', '.');
  git(dir, 'commit', '-m', 'first');
  git(dir, 'tag', '-a', tags[0], '-m', tags[0]);
  await writeFile(join(dir, 'later.txt'), 'later');
  for (const [path, contents] of Object.entries(laterFiles)) {
    await mkdir(join(dir, path, '..'), { recursive: true });
    await writeFile(join(dir, path), contents, { mode: path.endsWith('.sh') ? 0o755 : 0o644 });
  }
  git(dir, 'add', '.');
  git(dir, 'commit', '-m', 'second');
  git(dir, 'tag', '-a', tags[1], '-m', tags[1]);
  // The deployment checkout sits on the tag it is running, detached, and
  // fetches from a remote. Fetching from itself is enough for the script.
  git(dir, 'remote', 'add', 'origin', dir);
  git(dir, 'checkout', tags[0]);
  return dir;
}

const REAL_SCRIPT = readFileSync(join(REPO, 'scripts', 'cutover.sh'), 'utf8');

/**
 * What the deployment checkout is sitting on before the run.
 *
 * On a real host it is the previous release, whose cutover.sh is whatever that
 * release shipped, and the release being deployed carries a different one. A
 * fixture that puts the same script on both tags cannot see what happens when
 * the checkout replaces the file the shell is reading, so the newer tag can be
 * given a script of its own here.
 */
async function scratchStack({ pin = 'v0.1.0\n', laterScript = REAL_SCRIPT } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'via-cutover-'));
  const files = {
    'scripts/cutover.sh': REAL_SCRIPT,
    'docker-compose.yml': 'services: {}\n',
    // A real host keeps its settings beside the compose file and out of git,
    // and the script now asks for them before it touches anything.
    '.gitignore': '.env\n',
  };
  // A pin of null is a release that carries no pin file at all.
  if (pin !== null) files['deploy/bot-release'] = pin;
  await scratchRepo(join(dir, 'platform'), files, ['v0.9.0', 'v1.0.0'],
    { 'scripts/cutover.sh': laterScript });
  await scratchRepo(join(dir, 'bot'), { 'README.md': 'bot\n' }, ['v0.0.9', 'v0.1.0']);
  // The settings a real host has. A test that is about something else should
  // not have to say so, and the ones that are about the settings write their
  // own over the top of this.
  await writeFile(join(dir, 'platform', '.env'), [
    'DB_USER=via', 'DB_PASSWORD=not-a-password-not-a-password-no',
    'JWT_SECRET=not-a-secret-not-a-secret-not-a-secret',
    'SESSION_SECRET=not-a-secret-not-a-secret-not-a-secret-two',
    'CLIENT_URL=https://viaillinois.com',
    'BOT_SERVICE_TOKEN=not-a-token-not-a-token-not-a-token',
    'DISCORD_TOKEN=not-a-token-not-a-token-not-a-token-two',
    'DISCORD_APPLICATION_ID=123456789012345678',
    'BOT_DB_PASSWORD=not-a-password-not-a-password-two',
    'DISCORD_INTEREST_SALT=not-a-salt-not-a-salt-not-a-salt-not',
  ].join('\n') + '\n');
  await mkdir(join(dir, 'bin'), { recursive: true });
  await writeFile(join(dir, 'bin', 'docker'), DOCKER_STUB, { mode: 0o755 });
  await writeFile(join(dir, 'bin', 'curl'), CURL_STUB, { mode: 0o755 });
  return dir;
}

function runCutover(dir, extraEnv = {}, tag = 'v1.0.0') {
  const log = join(dir, 'stub.log');
  const result = spawnSync('bash', ['scripts/cutover.sh', tag], {
    cwd: join(dir, 'platform'),
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
      STUB_LOG: log,
      BOT_CHECKOUT: join(dir, 'bot'),
      BACKUP_DIR: join(dir, 'backups'),
      DEPLOY_LOG: join(dir, 'deploy.log'),
      HEALTH_TIMEOUT_SECONDS: '1',
      BOT_HEALTH_TIMEOUT_SECONDS: '1',
      ...extraEnv,
    },
  });
  return {
    ...result,
    calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : [],
  };
}

/** Where a call matching the pattern first appears in the recorded calls. */
function at(calls, pattern) {
  const index = calls.findIndex((line) => line.includes(pattern));
  expect(index, `no recorded call contains ${pattern}`).toBeGreaterThan(-1);
  return index;
}

function describedTag(dir) {
  return execFileSync('git', ['describe', '--tags', '--abbrev=0'], { cwd: dir, encoding: 'utf8' }).trim();
}

describe('cutover.sh with the bot', () => {
  let dir;
  beforeEach(async () => { dir = await scratchStack(); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('checks out both tags, the bot at the one deploy/bot-release pins', () => {
    const result = runCutover(dir);
    expect(result.status).toBe(0);
    expect(describedTag(join(dir, 'platform'))).toBe('v1.0.0');
    expect(describedTag(join(dir, 'bot'))).toBe('v0.1.0');
  }, 30_000);

  it('refuses a bot checkout that is not there, before building anything', async () => {
    const result = runCutover(dir, { BOT_CHECKOUT: join(dir, 'nowhere') });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/nowhere/);
    expect(result.calls).toEqual([]);
  }, 30_000);

  it('refuses a dirty bot checkout in the same words as its own dirty tree', async () => {
    await writeFile(join(dir, 'bot', 'stray.txt'), 'uncommitted');
    const dirtyBot = runCutover(dir);
    expect(dirtyBot.status).not.toBe(0);
    expect(dirtyBot.stdout).toMatch(/working tree is dirty/);
    expect(dirtyBot.calls).toEqual([]);
    await rm(join(dir, 'bot', 'stray.txt'));

    await writeFile(join(dir, 'platform', 'stray.txt'), 'uncommitted');
    const dirtyPlatform = runCutover(dir);
    expect(dirtyPlatform.status).not.toBe(0);
    expect(dirtyPlatform.stdout).toMatch(/working tree is dirty/);
  }, 30_000);

  it('refuses a pin that is not a tag in the bot checkout', async () => {
    const other = await scratchStack({ pin: 'v9.9.9\n' });
    try {
      const result = runCutover(other);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toMatch(/v9\.9\.9/);
      // Nothing was built, so nothing has to be undone.
      expect(other && result.calls.filter((line) => line.includes('build'))).toEqual([]);
      expect(describedTag(join(other, 'platform'))).toBe('v0.9.0');
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  }, 30_000);

  /**
   * The pin is read after the release tag is checked out, so a pin that cannot
   * be used leaves the tree on a tag that is not being deployed. Nothing has
   * been built and no container has been touched at that point, so the tree
   * goes back where it was found, exactly as it does when the pin names a tag
   * the bot checkout does not have.
   */
  it('puts the tree back when there is no pin file at all', async () => {
    const other = await scratchStack({ pin: null });
    try {
      const result = runCutover(other);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toMatch(/no bot tag pinned/);
      expect(describedTag(join(other, 'platform'))).toBe('v0.9.0');
      expect(result.calls).toEqual([]);
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  }, 30_000);

  it('puts the tree back when the pin does not name a version tag', async () => {
    const other = await scratchStack({ pin: 'the-latest-one\n' });
    try {
      const result = runCutover(other);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toMatch(/does not name a version tag/);
      expect(describedTag(join(other, 'platform'))).toBe('v0.9.0');
      expect(result.calls).toEqual([]);
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  }, 30_000);

  it('hands the bot checkout to compose as well as using it itself', () => {
    // Read from the script rather than from a stub, because the environment a
    // test runs the script in has the setting exported already and so could
    // not tell an exported one from a shell variable. Unexported, a moved
    // checkout would move for the cutover and not for the build context.
    const script = readFileSync(join(REPO, 'scripts', 'cutover.sh'), 'utf8');
    expect(script).toMatch(/^export BOT_CHECKOUT$/m);
  });

  it('builds both images before the maintenance window opens', () => {
    const { calls } = runCutover(dir);
    expect(at(calls, 'build')).toBeLessThan(at(calls, 'stop'));
    const build = calls[at(calls, 'build')];
    expect(build).toContain('via');
    expect(build).toContain('via-bot');
  }, 30_000);

  /**
   * A build failure is the last refusal before any container is touched, and
   * it is the one that left both checkouts moved. v0.6.0 shipped a compose
   * file that did not parse, so the build failed on the server with the
   * website checkout sitting on the tag that could not be deployed. That
   * matters beyond tidiness: PREVIOUS_TAG is read from the checkout at the
   * start of the run, so the next attempt would have recorded the broken tag
   * as the thing to roll back to.
   */
  it('puts both checkouts back when the build fails', () => {
    const result = runCutover(dir, { DOCKER_FAIL_MATCH: 'build via via-bot' });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toMatch(/image build failed/);
    expect(describedTag(join(dir, 'platform'))).toBe('v0.9.0');
    expect(describedTag(join(dir, 'bot'))).toBe('v0.0.9');
    // Nothing was stopped, so there is nothing to restart and no backup to
    // restore. The host is exactly as it was found.
    expect(result.calls.filter((line) => line.includes('stop'))).toEqual([]);
    expect(result.calls.filter((line) => line.includes('restoreCli.js'))).toEqual([]);
  }, 30_000);

  it('backs up and verifies both databases before stopping either container', () => {
    const { calls } = runCutover(dir);
    const platformBackup = at(calls, 'backupCli.js --dir');
    const botBackup = at(calls, '--database via_bot');
    expect(platformBackup).toBeLessThan(botBackup);
    expect(botBackup).toBeLessThan(at(calls, 'stop'));
  }, 30_000);

  it('migrates the web platform before the bot, with both containers stopped', () => {
    const { calls } = runCutover(dir);
    expect(at(calls, 'stop')).toBeLessThan(at(calls, 'db/migrate.ts'));
    expect(at(calls, 'db/migrate.ts')).toBeLessThan(at(calls, 'src/db/migrate.ts'));
    expect(calls[at(calls, 'src/db/migrate.ts')]).toContain('via-bot');
    // The bot service declares the web platform as something it depends on,
    // and a compose run would otherwise start it here, in the middle of the
    // maintenance window and with nothing gating on its health. The database
    // is never stopped by the cutover, so it is already up.
    expect(calls[at(calls, 'src/db/migrate.ts')]).toContain('--no-deps');
  }, 30_000);

  it('starts the web platform and waits for it before starting the bot', () => {
    // The bot's health answer is unavailable until the web platform answers
    // it, so this order is not a preference.
    const { calls } = runCutover(dir);
    const startPlatform = at(calls, 'up -d via');
    const platformHealth = at(calls, '3000/health');
    const startBot = calls.findIndex((line) => line.includes('up -d via-bot'));
    const botHealth = at(calls, '3002/health');
    expect(startPlatform).toBeLessThan(platformHealth);
    expect(platformHealth).toBeLessThan(startBot);
    expect(startBot).toBeLessThan(botHealth);
  }, 30_000);

  it('restores both databases and both checkouts when the bot never comes up', async () => {
    const result = runCutover(dir, { CURL_UNHEALTHY: '3002' });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toMatch(/rolled back/);
    const restores = result.calls.filter((line) => line.includes('restoreCli.js'));
    expect(restores).toHaveLength(2);
    expect(restores.some((line) => line.includes('--database via_bot'))).toBe(true);
    expect(describedTag(join(dir, 'platform'))).toBe('v0.9.0');
    expect(describedTag(join(dir, 'bot'))).toBe('v0.0.9');
  }, 60_000);

  it('rolls both back when the web platform never comes up', () => {
    const result = runCutover(dir, { CURL_UNHEALTHY: '3000' });
    expect(result.status).not.toBe(0);
    expect(describedTag(join(dir, 'platform'))).toBe('v0.9.0');
    expect(describedTag(join(dir, 'bot'))).toBe('v0.0.9');
    // The bot is never started into a web platform that is not answering.
    expect(result.calls.filter((line) => line.includes('up -d via-bot'))).toHaveLength(0);
  }, 60_000);

  it('rolls both back when the bot migration fails', () => {
    const result = runCutover(dir, { DOCKER_FAIL_MATCH: 'src/db/migrate.ts' });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toMatch(/migration failed/);
    expect(result.calls.filter((line) => line.includes('restoreCli.js'))).toHaveLength(2);
    expect(describedTag(join(dir, 'bot'))).toBe('v0.0.9');
  }, 60_000);

  /**
   * The rollback's job is the website. A previous compose file with no bot
   * service, which is every compose file before this release, makes one
   * command naming both services fail as a whole, and the website that the
   * rollback exists to bring back never starts.
   */
  it('starts the website in the rollback even when starting the bot fails', () => {
    const result = runCutover(dir, {
      CURL_UNHEALTHY: '3002',
      DOCKER_FAIL_MATCH: 'up -d --build via-bot',
    });
    expect(result.status).not.toBe(0);
    expect(result.calls).toContain('docker compose up -d --build via');
    expect(result.calls).toContain('docker compose up -d --build via-bot');
    expect(result.stdout).toMatch(/could not restart the previous bot image/);
    expect(result.stdout).toMatch(/rollback complete/);
  }, 60_000);

  it('logs the version of both services when it finishes', async () => {
    const result = runCutover(dir);
    expect(result.status).toBe(0);
    const log = await readFile(join(dir, 'deploy.log'), 'utf8');
    expect(log).toMatch(/tag=v1\.0\.0/);
    expect(log).toMatch(/bot=v0\.1\.0/);
    expect(log).toMatch(/"gateway":true/);
  }, 30_000);
});

/**
 * The release being deployed carries a different cutover script than the one
 * the host is sitting on, which is the ordinary case and was never tested.
 *
 * The script checks out the release tag, and that checkout rewrites
 * scripts/cutover.sh while the shell is still reading it. A shell reads a
 * script lazily, by byte offset, so it carries on inside whatever file is at
 * that path now. Deploying the release that first added the bot, the steps that
 * build and start the bot were in the new file and the shell was reading the
 * old one, so the website moved forward and the bot was never created, with
 * nothing in the log to say so.
 *
 * The script runs from a copy of itself now, so the file the checkout replaces
 * is not the file being read. Note what this can and cannot do: it protects
 * every deploy made from a host that already carries it, and it cannot protect
 * the one deploy that introduces it, because that run is made by whatever
 * script the host is already sitting on. docs/deployment.md says so.
 *
 * The fixture used to put the same script on both tags, so the checkout wrote
 * the file back byte for byte and the offsets always lined up. That is why
 * nothing here caught it.
 */
describe('a release whose cutover script differs from the one on the host', () => {
  /** The release being deployed ships a script with a step of its own. */
  const WITH_AN_EXTRA_STEP = REAL_SCRIPT.replace(
    'log "backups: ${BACKUP_PATH} and ${BOT_BACKUP_PATH}"',
    'log "backups: ${BACKUP_PATH} and ${BOT_BACKUP_PATH}"\nlog "a step only the new release knows about"',
  );

  it('runs the script the release ships rather than the one the host was on', async () => {
    const dir = await scratchStack({ laterScript: WITH_AN_EXTRA_STEP });
    const run = runCutover(dir);

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('a step only the new release knows about');
  });

  it('still carries out every step of it, the bot included', async () => {
    const dir = await scratchStack({ laterScript: WITH_AN_EXTRA_STEP });
    const run = runCutover(dir);

    expect(run.calls.some(line => line.includes('build via via-bot'))).toBe(true);
    expect(run.calls.some(line => line.includes('up -d via-bot'))).toBe(true);
    expect(run.stdout).toContain('cutover complete');
  });

  it('reads itself from a copy, which is what makes that possible', () => {
    // The mechanism rather than the effect, so that taking it out is a failure
    // here rather than a surprise on a server in a year.
    expect(REAL_SCRIPT).toMatch(/CUTOVER_RUNNING_COPY/);
    expect(REAL_SCRIPT).toMatch(/exec bash "\$copy"/);
    // The guard has to come before anything that checks out a tag.
    expect(REAL_SCRIPT.indexOf('CUTOVER_RUNNING_COPY'))
      .toBeLessThan(REAL_SCRIPT.indexOf('git checkout "$RELEASE_TAG"'));
  });

  it('leaves no copy of itself behind', async () => {
    const dir = await scratchStack({ laterScript: WITH_AN_EXTRA_STEP });
    runCutover(dir);
    const strays = readdirSync(tmpdir()).filter(name => /^cutover\..*\.sh$/.test(name));
    expect(strays).toEqual([]);
  });
});

/**
 * A setting that is missing should stop the deploy while the site is still up.
 *
 * Every Discord variable in the compose file defaults to empty, so a host whose
 * .env predates the bot starts a bot that never logs in. That was discovered at
 * the last step of the run, inside the maintenance window, and the failing
 * health check then rolled the website back with it. It costs nothing to ask
 * before anything has been touched, which is the ordering the rest of this
 * script is built around.
 */
describe('the settings a deploy needs', () => {
  const ENOUGH = [
    'DB_USER=via', 'DB_PASSWORD=not-a-password-not-a-password-no',
    'JWT_SECRET=not-a-secret-not-a-secret-not-a-secret',
    'SESSION_SECRET=not-a-secret-not-a-secret-not-a-secret-two',
    'CLIENT_URL=https://viaillinois.com',
  ].join('\n') + '\n';

  const BOT = [
    'BOT_SERVICE_TOKEN=not-a-token-not-a-token-not-a-token',
    'DISCORD_TOKEN=not-a-token-not-a-token-not-a-token-two',
    'DISCORD_APPLICATION_ID=123456789012345678',
    'BOT_DB_PASSWORD=not-a-password-not-a-password-two',
    'DISCORD_INTEREST_SALT=not-a-salt-not-a-salt-not-a-salt-not',
  ].join('\n') + '\n';

  it('refuses before anything is touched when a setting is missing', async () => {
    const dir = await scratchStack();
    // A deployment that runs the bot is one that has a service token for it,
    // and this one has the token and none of what the bot needs beside it.
    await writeFile(join(dir, 'platform', '.env'),
      ENOUGH + 'BOT_SERVICE_TOKEN=not-a-token-not-a-token-not-a-token\n');
    const run = runCutover(dir);

    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toMatch(/DISCORD_TOKEN/);
    // Nothing built, nothing stopped, nothing migrated.
    expect(run.calls.some(line => line.includes('build'))).toBe(false);
    expect(run.calls.some(line => line.includes('stop'))).toBe(false);
  });

  it('names a setting that is only a placeholder as missing', async () => {
    const dir = await scratchStack();
    await writeFile(join(dir, 'platform', '.env'),
      ENOUGH.replace('JWT_SECRET=not-a-secret-not-a-secret-not-a-secret', 'JWT_SECRET=change_me_in_production') + BOT);
    const run = runCutover(dir);

    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toMatch(/JWT_SECRET/);
  });

  it('goes ahead when everything it needs is really set', async () => {
    const dir = await scratchStack();
    await writeFile(join(dir, 'platform', '.env'), ENOUGH + BOT);
    const run = runCutover(dir);

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('cutover complete');
  });

  it('says what is missing rather than stopping at the first one', async () => {
    const dir = await scratchStack();
    await writeFile(join(dir, 'platform', '.env'),
      ENOUGH + 'BOT_SERVICE_TOKEN=not-a-token-not-a-token-not-a-token\n');
    const run = runCutover(dir);
    const said = run.stdout + run.stderr;
    expect(said).toMatch(/DISCORD_TOKEN/);
    expect(said).toMatch(/BOT_DB_PASSWORD/);
  });
});
