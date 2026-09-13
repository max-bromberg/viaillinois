import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pin = readFileSync(join(root, 'deploy', 'bot-release'), 'utf8');

/**
 * The Discord bot is deployed from a checkout of its own repository beside
 * this one, at the tag named here. The cutover reads this file, checks the
 * sibling out at that tag and builds the image from it, so the file is the
 * only statement anywhere of which bot a given web platform tag runs.
 *
 * A release of the bot alone is a change to this line, merged through the
 * gate, and a cutover. A release of the web platform alone leaves it as it is.
 */
describe('deploy/bot-release', () => {
  it('names one tag and nothing else', () => {
    // Read by a shell script, which would take a second line as part of the
    // tag and a comment as a tag of its own.
    const lines = pin.split('\n').filter((line) => line.trim() !== '');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it('ends with a newline and carries no leading or trailing space', () => {
    expect(pin.endsWith('\n')).toBe(true);
    expect(pin.trimEnd()).toBe(pin.trim());
  });
});
