import { getLinkByNetId, setLinkAuthorization } from '../db/queries/discordLinks.ts';
import { getUserMemberships } from '../db/queries/rso.js';
import { readKey, seal, open } from '../lib/secretBox.js';

/**
 * The three facts a Discord server can require a role on.
 *
 * Discord's linked roles let an application publish a handful of facts about a
 * person, which a server owner can then require for a role. VIA publishes
 * three: that the person is a verified member of the campus community, that
 * they sit on the board of at least one RSO, and the day they linked. A server
 * can then hand out a "verified" role or a "board" role without VIA knowing
 * anything about that server, and without the bot being in it.
 *
 * Pushing a fact needs a Discord access token for the person, which is why the
 * refresh token from the link flow is kept, sealed, in Discord_Links. It is
 * opened here, exchanged for an access token, used once and forgotten, and the
 * refresh token Discord hands back in its place is sealed and stored again.
 *
 * Every request Discord answers goes through the fetch the caller hands in, so
 * a test never reaches Discord and a failure here is always a value rather than
 * an exception: none of this is worth failing a link over, and a person whose
 * facts are stale keeps the role until the next membership change refreshes it.
 */

const API = 'https://discord.com/api/v10';

/** The name a Discord server sees beside the facts. */
export const PLATFORM_NAME = 'VIA';

/**
 * The schema, as Discord's metadata types number them: 5 is a date at or
 * before the value the server asks for, and 7 is a boolean equal to it.
 */
export const METADATA_SCHEMA = [
  {
    key: 'verified',
    name: 'Verified student',
    description: 'This person signed in with a University of Illinois NetID and linked their account to VIA.',
    type: 7,
  },
  {
    key: 'board',
    name: 'Board member',
    description: 'This person sits on the board of at least one registered student organization on VIA.',
    type: 7,
  },
  {
    key: 'linked_since',
    name: 'Linked since',
    description: 'The day this person linked their Discord account to VIA.',
    type: 5,
  },
];

/** Whether an application and a key for the sealed authorization are both configured. */
export function isConfigured(env = process.env) {
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_LINK_KEY);
}

/** Form encoded, which is the only shape Discord's token endpoint accepts. */
function form(fields) {
  return new URLSearchParams(fields).toString();
}

/**
 * An application wide token, from the client credentials grant, which is what
 * registering the metadata schema is authorized with.
 */
async function applicationToken(fetchImpl, env) {
  const res = await fetchImpl(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: 'role_connections.write identify',
    }),
  });
  if (!res.ok) return null;
  return (await res.json()).access_token ?? null;
}

/**
 * Publish the schema, once, at startup.
 *
 * Discord keeps one schema per application, so putting the same three fields
 * again is how it is kept current and costs nothing when nothing changed.
 *
 * @returns {Promise<{ registered: boolean, reason?: string }>}
 */
export async function registerMetadata({ fetchImpl = globalThis.fetch, env = process.env } = {}) {
  if (!isConfigured(env)) return { registered: false, reason: 'not_configured' };
  try {
    const token = await applicationToken(fetchImpl, env);
    if (!token) return { registered: false, reason: 'discord_refused' };

    const res = await fetchImpl(`${API}/applications/${env.DISCORD_CLIENT_ID}/role-connections/metadata`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(METADATA_SCHEMA),
    });
    if (!res.ok) return { registered: false, reason: 'discord_refused' };
    return { registered: true };
  } catch (err) {
    console.error('registering the linked role fields failed:', err.message);
    return { registered: false, reason: 'unreachable' };
  }
}

/**
 * Exchange the sealed refresh token for an access token, and seal the refresh
 * token Discord rotates to in its place.
 *
 * An authorization Discord will no longer refresh has been revoked by the
 * person on Discord's side, so it is forgotten here rather than retried
 * forever, and the link itself stays.
 *
 * @returns {Promise<{ token: string }|{ reason: string }>}
 */
async function accessTokenFor(netId, link, fetchImpl, env, key) {
  const res = await fetchImpl(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: open(link.authorization, key),
    }),
  });
  if (!res.ok) {
    await setLinkAuthorization(netId, null);
    return { reason: 'refresh_refused' };
  }
  const body = await res.json();
  if (body.refresh_token) await setLinkAuthorization(netId, seal(body.refresh_token, key));
  return { token: body.access_token };
}

/** What the person's row and memberships say, in the shape Discord stores. */
async function factsFor(netId, link) {
  const memberships = (await getUserMemberships(netId)) ?? [];
  return {
    verified: 1,
    board: memberships.some(m => m.role === 'Board') ? 1 : 0,
    linked_since: String(link.linkedAt ?? '').slice(0, 10),
  };
}

/**
 * Push one person's facts to Discord.
 *
 * Called when a link is made and whenever the person's memberships change. A
 * person who declined the linked roles step has no authorization stored, and
 * is passed over in silence rather than counted as a failure.
 *
 * @returns {Promise<{ pushed: boolean, reason?: string }>}
 */
export async function pushFacts(netId, { fetchImpl = globalThis.fetch, env = process.env } = {}) {
  if (!isConfigured(env)) return { pushed: false, reason: 'not_configured' };
  const key = readKey(env);
  try {
    const link = await getLinkByNetId(netId);
    if (!link) return { pushed: false, reason: 'not_linked' };
    if (!link.authorization) return { pushed: false, reason: 'no_authorization' };

    const exchanged = await accessTokenFor(netId, link, fetchImpl, env, key);
    if (!exchanged.token) return { pushed: false, reason: exchanged.reason ?? 'discord_refused' };

    const res = await fetchImpl(`${API}/users/@me/applications/${env.DISCORD_CLIENT_ID}/role-connection`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${exchanged.token}` },
      body: JSON.stringify({ platform_name: PLATFORM_NAME, metadata: await factsFor(netId, link) }),
    });
    if (!res.ok) return { pushed: false, reason: 'discord_refused' };
    return { pushed: true };
  } catch (err) {
    console.error(`pushing the linked role facts for ${netId} failed:`, err.message);
    return { pushed: false, reason: 'unreachable' };
  }
}

/**
 * Take the facts back when somebody unlinks.
 *
 * Called while the link row still exists, because the authorization it holds
 * is what authorizes the change. Everything about it is best effort: a person
 * who unlinks is unlinked whatever Discord says, and a role that lingers on
 * one server is a smaller problem than a refusal to unlink.
 *
 * @returns {Promise<{ cleared: boolean, reason?: string }>}
 */
export async function clearFacts(netId, { fetchImpl = globalThis.fetch, env = process.env } = {}) {
  if (!isConfigured(env)) return { cleared: false, reason: 'not_configured' };
  const key = readKey(env);
  try {
    const link = await getLinkByNetId(netId);
    if (!link) return { cleared: false, reason: 'not_linked' };
    if (!link.authorization) return { cleared: false, reason: 'no_authorization' };

    const exchanged = await accessTokenFor(netId, link, fetchImpl, env, key);
    if (!exchanged.token) return { cleared: false, reason: exchanged.reason ?? 'discord_refused' };

    const res = await fetchImpl(`${API}/users/@me/applications/${env.DISCORD_CLIENT_ID}/role-connection`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${exchanged.token}` },
      body: JSON.stringify({ platform_name: PLATFORM_NAME, metadata: {} }),
    });
    if (!res.ok) return { cleared: false, reason: 'discord_refused' };
    return { cleared: true };
  } catch (err) {
    console.error(`clearing the linked role facts for ${netId} failed:`, err.message);
    return { cleared: false, reason: 'unreachable' };
  }
}
