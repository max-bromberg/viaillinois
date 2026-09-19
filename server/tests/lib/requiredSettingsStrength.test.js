import { describe, it, expect } from 'vitest';
import { missingProductionSettings } from '../../lib/requiredSettings.js';

/**
 * A secret that is present is not the same as a secret that is secret.
 *
 * The check exists because a signing key that falls back to a value written in
 * this repository is wrong in a way nobody sees until somebody meets it. It
 * refused an empty variable and accepted anything else, so the ordinary way of
 * setting a host up, copying .env.example and filling in the database password,
 * produces a production process whose JWT key is the literal string
 * change_me_in_production, which is published here and which anybody can sign a
 * global admin token with. That is a full takeover with nothing in the running
 * system to indicate it.
 *
 * Refusing to start says so once, at the moment the deploy can still be rolled
 * back, which is the whole argument for the check in the first place.
 */
const sound = {
  JWT_SECRET: 'not-a-secret-not-a-secret-not-a-secret',
  SESSION_SECRET: 'not-a-secret-not-a-secret-not-a-secret-two',
  DB_PASSWORD: 'not-a-password-not-a-password-no',
  DB_USER: 'via',
};

describe('what a production process refuses to start without', () => {
  it('accepts settings that are all present and all real', () => {
    expect(missingProductionSettings({ ...sound })).toEqual([]);
  });

  it('still names the ones that are missing entirely', () => {
    expect(missingProductionSettings({ ...sound, JWT_SECRET: '' })).toEqual(['JWT_SECRET']);
  });

  it('refuses the placeholder this repository publishes', () => {
    expect(missingProductionSettings({ ...sound, JWT_SECRET: 'change_me_in_production' }))
      .toEqual(['JWT_SECRET']);
  });

  it('refuses a placeholder whichever way it is capitalised or spaced', () => {
    for (const written of ['CHANGE_ME_IN_PRODUCTION', '  change_me_in_production  ', 'changeme']) {
      expect(missingProductionSettings({ ...sound, SESSION_SECRET: written }))
        .toEqual(['SESSION_SECRET']);
    }
  });

  it('refuses the other words people reach for instead of a secret', () => {
    for (const written of ['secret', 'password', 'dev_secret', 'dev_session_secret', 'todo']) {
      expect(missingProductionSettings({ ...sound, JWT_SECRET: written })).toEqual(['JWT_SECRET']);
    }
  });

  /**
   * A short key is brute forceable offline, and a signing key is exactly the
   * thing somebody would brute force offline, because every token the platform
   * issues is a free sample of its output.
   */
  it('refuses a signing key too short to be worth signing with', () => {
    expect(missingProductionSettings({ ...sound, JWT_SECRET: 'abc123' })).toEqual(['JWT_SECRET']);
  });

  it('holds only the signing keys to that length, not the database settings', () => {
    // A database user is a name, and its password is chosen elsewhere and set
    // on the database itself, so this check is not the place to police it.
    expect(missingProductionSettings({ ...sound, DB_USER: 'via' })).toEqual([]);
  });

  it('names every weak one rather than stopping at the first', () => {
    expect(missingProductionSettings({
      ...sound, JWT_SECRET: 'change_me_in_production', SESSION_SECRET: 'secret',
    })).toEqual(['JWT_SECRET', 'SESSION_SECRET']);
  });

  it('holds the interest salt to the same bar, since it is also a secret', () => {
    expect(missingProductionSettings({
      ...sound, BOT_SERVICE_TOKEN: 'not-a-token-not-a-token-not-a-token-three', DISCORD_INTEREST_SALT: 'changeme',
    })).toEqual(['DISCORD_INTEREST_SALT']);
  });
});
