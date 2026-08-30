import { describe, it, expect } from 'vitest';
import { nextVersion } from '../version.js';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = join(import.meta.dirname, '..', '..');

describe('nextVersion', () => {
  it('bumps a patch', () => expect(nextVersion('0.2.0', 'patch')).toBe('0.2.1'));
  it('bumps a minor and resets the patch', () => expect(nextVersion('0.2.3', 'minor')).toBe('0.3.0'));
  it('bumps a major and resets the rest', () => expect(nextVersion('0.2.3', 'major')).toBe('1.0.0'));
  it('rejects a non-semver current version', () => expect(() => nextVersion('v1', 'patch')).toThrow());
  it('rejects an unknown level', () => expect(() => nextVersion('0.2.0', 'sideways')).toThrow());
});

/** Build a throwaway git repository containing the bump script and three manifests. */
async function scratchRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'via-bump-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  for (const sub of ['', 'server', 'client']) {
    if (sub) await mkdir(join(dir, sub), { recursive: true });
    await writeFile(join(dir, sub, 'package.json'), JSON.stringify({ name: sub || 'via', version: '0.2.0' }, null, 2));
  }
  await mkdir(join(dir, 'scripts'), { recursive: true });
  await writeFile(join(dir, 'scripts', 'version.js'), readFileSync(join(REPO, 'scripts', 'version.js'), 'utf8'));
  await writeFile(join(dir, 'scripts', 'bump-version.sh'), readFileSync(join(REPO, 'scripts', 'bump-version.sh'), 'utf8'), { mode: 0o755 });
  await writeFile(join(dir, 'CHANGELOG.md'), '# Changelog\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir });
  return dir;
}

describe('bump-version.sh', () => {
  it('refuses to run on a dirty working tree and changes nothing', async () => {
    const dir = await scratchRepo();
    await writeFile(join(dir, 'stray.txt'), 'uncommitted');
    let failed = false;
    try {
      execFileSync('bash', ['scripts/bump-version.sh', 'patch'], { cwd: dir, env: { ...process.env, EDITOR: 'true' } });
    } catch { failed = true; }
    expect(failed).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version).toBe('0.2.0');
    await rm(dir, { recursive: true, force: true });
  });

  it('refuses to run off the main branch', async () => {
    const dir = await scratchRepo();
    execFileSync('git', ['checkout', '-b', 'feature'], { cwd: dir });
    let failed = false;
    try {
      execFileSync('bash', ['scripts/bump-version.sh', 'patch'], { cwd: dir, env: { ...process.env, EDITOR: 'true' } });
    } catch { failed = true; }
    expect(failed).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version).toBe('0.2.0');
    await rm(dir, { recursive: true, force: true });
  });

  it('writes all three manifests, commits, and creates an annotated tag', async () => {
    const dir = await scratchRepo();
    execFileSync('bash', ['scripts/bump-version.sh', 'minor'], { cwd: dir, env: { ...process.env, EDITOR: 'true' } });

    for (const sub of ['', 'server', 'client']) {
      expect(JSON.parse(readFileSync(join(dir, sub, 'package.json'), 'utf8')).version).toBe('0.3.0');
    }
    const tags = execFileSync('git', ['tag'], { cwd: dir, encoding: 'utf8' });
    expect(tags).toContain('v0.3.0');
    const type = execFileSync('git', ['cat-file', '-t', 'v0.3.0'], { cwd: dir, encoding: 'utf8' }).trim();
    expect(type).toBe('tag');
    await rm(dir, { recursive: true, force: true });
  });
});
