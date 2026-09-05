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
 * @param {Record<string, string|undefined>} env
 * @returns {string[]} the names that are missing, in the order they are asked for
 */
export function missingProductionSettings(env) {
  const required = env.BOT_SERVICE_TOKEN ? [...ALWAYS, ...WITH_THE_BOT] : [...ALWAYS];
  return required.filter(name => !env[name]);
}
