import { describe, it, expect } from 'vitest';
import { readVersions } from '../version.js';

describe('version consistency', () => {
  it('root, server and client declare the identical version', () => {
    const { root, server, client } = readVersions();
    expect(server).toBe(root);
    expect(client).toBe(root);
  });

  it('the version is valid semver', () => {
    const { root } = readVersions();
    expect(root).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
