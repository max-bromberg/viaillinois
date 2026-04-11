import { describe, it, expect } from 'vitest';
import * as rso      from '../../db/queries/rso.js';
import * as users    from '../../db/queries/users.js';

const stubs = [
  ['rso.createRso',                () => rso.createRso({ name: 'Test' })],
  ['users.getAllLocalUsers',       () => users.getAllLocalUsers()],
  ['users.deleteUser',             () => users.deleteUser('a')],
  ['users.updateLocalPassword',    () => users.updateLocalPassword('a', 'hash')],
  ['users.updateUser',             () => users.updateUser('a', {})],
];

describe('Query stubs', () => {
  stubs.forEach(([name, fn]) => {
    it(`${name} exists and throws Not implemented`, async () => {
      await expect(fn()).rejects.toThrow('Not implemented');
    });
  });
});
