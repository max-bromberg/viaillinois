import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const MANIFESTS = {
  root:   join(ROOT, 'package.json'),
  server: join(ROOT, 'server', 'package.json'),
  client: join(ROOT, 'client', 'package.json'),
};

/** @returns {{ root: string, server: string, client: string }} */
export function readVersions() {
  const out = {};
  for (const [name, path] of Object.entries(MANIFESTS)) {
    out[name] = JSON.parse(readFileSync(path, 'utf8')).version;
  }
  return out;
}

/**
 * Write the same version into all three manifests.
 *
 * Rewrites only the version field and preserves the rest of the file byte for
 * byte, so that a bump produces a one line diff per manifest rather than a
 * reformatting of the whole file.
 */
export function writeVersion(version) {
  for (const path of Object.values(MANIFESTS)) {
    const raw = readFileSync(path, 'utf8');
    const next = raw.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${version}"`);
    if (next === raw) throw new Error(`could not rewrite version in ${path}`);
    writeFileSync(path, next);
  }
}

/** @param {'patch'|'minor'|'major'} level */
export function nextVersion(current, level) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) throw new Error(`not a semver version: ${current}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  if (level === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`unknown bump level: ${level}`);
}
