import { Router } from 'express';
import { installUrl } from '../controllers/rsoDiscord.js';

/**
 * The two ways a person adds the VIA Discord bot.
 *
 * A board adds it to a server, which is what puts an organization's events in
 * front of its members, and that address is the one the dashboard offers. Any
 * student at all adds it to their own Discord account, which needs no server,
 * no permission from anybody and no club to be a member of. That second one is
 * what makes the bot a way for one person to hear about events rather than
 * something their club happens to run, and it is why this endpoint answers
 * everybody rather than only a board.
 *
 * Both are built from the Discord application identifier, which is
 * configuration rather than a secret: it appears in every install link the bot
 * has ever handed out and in the address bar of everybody who has used one. A
 * deployment with no Discord application configured says so, so that a page
 * can leave the offer out rather than showing an address that leads nowhere.
 */

/**
 * Adding the bot to a person's own account.
 *
 * integration_type=1 is Discord's user installation, which is what puts the
 * commands on the person rather than on a server. It asks for
 * applications.commands and nothing else, because a user installation has no
 * server to be a member of and the bot scope is not one it may request.
 */
export function personalInstallUrl() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    integration_type: '1',
    scope: 'applications.commands',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function createDiscordRouter() {
  const router = Router();

  router.get('/', (_req, res) => {
    const personal = personalInstallUrl();
    res.json({
      configured: Boolean(personal),
      server_install_url: installUrl(),
      personal_install_url: personal,
    });
  });

  return router;
}

export default createDiscordRouter();
