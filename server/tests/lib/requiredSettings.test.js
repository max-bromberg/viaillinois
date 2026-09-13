import { describe, it, expect } from 'vitest';
import { missingProductionSettings } from '../../lib/requiredSettings.js';

const COMPLETE = {
  JWT_SECRET: 'a', SESSION_SECRET: 'b', DB_PASSWORD: 'c', DB_USER: 'd',
};

/**
 * A production process that starts without one of these runs, answers, and is
 * wrong in a way nobody sees until somebody meets it. Refusing to start says
 * so once, at the moment the deploy can still be rolled back.
 */
describe('the settings production refuses to start without', () => {
  it('is satisfied by the four the web platform has always needed', () => {
    expect(missingProductionSettings(COMPLETE)).toEqual([]);
  });

  it('names every one that is missing rather than the first', () => {
    expect(missingProductionSettings({ JWT_SECRET: 'a' }).sort())
      .toEqual(['DB_PASSWORD', 'DB_USER', 'SESSION_SECRET']);
  });

  /**
   * Without the salt, interest from somebody who has not linked cannot be
   * recorded at all, and the bot has a button that does nothing but fail. A
   * deployment that runs the bot is one that has a service token for it.
   */
  it('adds the interest salt once a deployment runs the Discord bot', () => {
    expect(missingProductionSettings({ ...COMPLETE, BOT_SERVICE_TOKEN: 'a-token' }))
      .toEqual(['DISCORD_INTEREST_SALT']);
    expect(missingProductionSettings({
      ...COMPLETE, BOT_SERVICE_TOKEN: 'a-token', DISCORD_INTEREST_SALT: 'a-salt',
    })).toEqual([]);
  });

  it('does not ask for the salt on a deployment that does not run the bot', () => {
    expect(missingProductionSettings(COMPLETE)).toEqual([]);
    expect(missingProductionSettings({ ...COMPLETE, BOT_SERVICE_TOKEN: '' })).toEqual([]);
  });
});
