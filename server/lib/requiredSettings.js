/**
 * What a production process refuses to start without.
 *
 * A process that starts without one of these runs, answers requests, and is
 * wrong in a way nobody sees until somebody meets it: a signing secret that
 * falls back to a value written in this repository, or a salt whose absence
 * turns a button in Discord into an error every time it is pressed. Refusing
 * to start says so once, at the moment the deploy can still be rolled back.
 */

/** Needed by every deployment, whatever else it runs. */
const ALWAYS = ['JWT_SECRET', 'SESSION_SECRET', 'DB_PASSWORD', 'DB_USER'];

/**
 * A deployment that runs the Discord bot is one that has a service token for
 * it, and such a deployment needs the interest salt as well. Interest from
 * somebody who has not linked their account is recorded under a salted hash of
 * the Discord identifier, and with no salt there is nothing to hash with, so
 * the bot's button answers an error for ever rather than for a moment.
 */
const WITH_THE_BOT = ['DISCORD_INTEREST_SALT'];

/**
 * The settings that are secrets rather than names.
 *
 * A database user is a name and its password is set on the database itself, so
 * this file is not the place to police either. The rest are keys this process
 * signs or hashes with, and a key is only a key if nobody else has it.
 */
const SECRETS = new Set(['JWT_SECRET', 'SESSION_SECRET', 'DISCORD_INTEREST_SALT']);

/**
 * What people write instead of a secret.
 *
 * The first two are the words .env.example puts there, so copying that file and
 * filling in the database password is the ordinary way a host ends up signing
 * with a value published in this repository. The rest are what somebody reaches
 * for when they mean to come back to it later and do not.
 */
const PLACEHOLDERS = new Set([
  'change_me_in_production', 'changeme', 'change_me', 'changeit',
  'secret', 'password', 'todo', 'xxx', 'test',
  'dev_secret', 'dev_session_secret', 'your_secret_here', 'replace_me',
]);

/**
 * Short enough to be worked out offline.
 *
 * Every token the platform issues is a free sample of what this key produces,
 * so a short one is guessed at somebody else's leisure rather than against a
 * login limiter.
 */
const SECRET_MIN_LENGTH = 24;

/** Whether a value is a real secret rather than a stand in for one. */
function isRealSecret(value) {
  const written = String(value).trim();
  if (written.length < SECRET_MIN_LENGTH) return false;
  return !PLACEHOLDERS.has(written.toLowerCase());
}

/**
 * @param {Record<string, string|undefined>} env
 * @returns {string[]} the names that are missing or are not really set, in the
 *   order they are asked for
 */
export function missingProductionSettings(env) {
  const required = env.BOT_SERVICE_TOKEN ? [...ALWAYS, ...WITH_THE_BOT] : [...ALWAYS];
  return required.filter(name => {
    if (!env[name]) return true;
    return SECRETS.has(name) && !isRealSecret(env[name]);
  });
}
