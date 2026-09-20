import { apiFetch } from './base.js';

/**
 * The two ways a person adds the VIA Discord bot.
 *
 * A board adds it to a server. Any student adds it to their own Discord
 * account, which needs no server and nobody's permission, and that is what the
 * page about being notified offers. Both addresses are built from the Discord
 * application identifier, which the website holds and the browser does not.
 */
export const getDiscordEntry = () => apiFetch('/api/v1/discord');
