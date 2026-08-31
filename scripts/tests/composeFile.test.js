import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

  it('joins the external network that the reverse proxy reaches it on', () => {
    // The proxy in front of production resolves the application by service
    // name on this network. Publishing port 3000 is not a substitute: the
    // health check would still pass while the public site was unreachable.
    const network = section(compose, ['networks', 'default']);
    expect(network).toContain('external: true');
    expect(network).toContain('name: internal');
    expect(section(compose, ['services', 'via', 'networks'])).toContain('- default');
  });
});
