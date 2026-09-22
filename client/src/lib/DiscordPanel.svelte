<script>
  import { onMount } from 'svelte';
  import { getRsoDiscord, unbindRsoDiscord } from '../api/rsoDiscord.js';
  import { showToast } from '../stores/ui.js';

  /**
   * The board's own Discord server, on the dashboard.
   *
   * The binding belongs to the bot: it is a fact about a Discord server, the
   * bot is what is installed there, and the website has no account on the
   * bot's database. So what this panel reads is a mirror of what the bot last
   * reported, which can be a few seconds behind a board that has only just
   * finished the setup command. That is worth saying plainly rather than
   * leaving somebody to wonder why their server has not appeared.
   *
   * Disconnecting asks first, as removing a member does, because it takes the
   * bot out of a server full of people who are using it.
   */

  export let rsoId;
  /** Told when a disconnect changed what is connected, so the dashboard agrees. */
  export let onchanged = () => {};

  let guilds = [];
  let installUrl = null;
  let loading = true;
  /** Whether the lookup itself failed, which is not the same as no server. */
  let unreadable = false;
  let confirmingGuildId = null;
  let working = false;

  async function load() {
    loading = true;
    unreadable = false;
    try {
      const answer = await getRsoDiscord(rsoId);
      guilds = answer.guilds ?? [];
      installUrl = answer.install_url ?? null;
    } catch {
      // Not knowing is not the same as knowing there is none. A panel that
      // said no server was connected because it could not ask would send a
      // board off to connect one they already have.
      unreadable = true;
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function disconnect(guildId) {
    working = true;
    try {
      await unbindRsoDiscord(rsoId, guildId);
      confirmingGuildId = null;
      showToast(
        'That Discord server is disconnected. The bot leaves it alone from now on, and the '
        + 'server itself hears about it the next time the bot reads its instructions.',
      );
      await load();
      onchanged();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      working = false;
    }
  }
</script>

<section class="whole discord">
  <h3>Discord</h3>

  {#if loading}
    <p class="quiet">Reading what the bot has reported.</p>
  {:else if unreadable}
    <p class="quiet">
      Whether a Discord server is connected could not be read just now. Please open this
      page again in a moment.
    </p>
  {:else if guilds.length === 0}
    <p class="quiet">
      No Discord server is connected to this organization. Adding the VIA bot to your
      server posts your events there, announces changes, and lets your members find rooms
      and exam dates without leaving Discord.
    </p>
    {#if installUrl}
      <p>
        <a class="btn quiet" href={installUrl} target="_blank" rel="noopener noreferrer">
          Add the VIA bot to a Discord server
        </a>
      </p>
      <p class="help">
        You need Manage Server in the Discord server you are adding it to. Once it is in,
        run the setup command there and choose this organization. Your server appears here
        shortly afterwards.
      </p>
    {/if}
  {:else}
    <ul class="lines">
      {#each guilds as guild (guild.guild_id)}
        <li>
          <span class="what">
            <span class="name">{guild.guild_name || 'A Discord server'}</span>
            <small class="mono">{guild.guild_id}</small>
          </span>
          {#if confirmingGuildId === guild.guild_id}
            <span class="asked">
              <button type="button" class="btn danger" disabled={working}
                on:click={() => disconnect(guild.guild_id)}>
                Yes, disconnect it
              </button>
              <button type="button" class="btn quiet" disabled={working}
                on:click={() => confirmingGuildId = null}>
                Keep it connected
              </button>
            </span>
          {:else}
            <button type="button" class="btn quiet"
              on:click={() => confirmingGuildId = guild.guild_id}>
              Disconnect
            </button>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="help">
      Disconnecting stops the bot posting your events in that server. It does not remove
      the bot from the server, which is done in Discord's own server settings.
    </p>
  {/if}
</section>

<style>
  .discord .asked { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .discord .what { display: flex; flex-direction: column; gap: 2px; }
  .discord .what .mono { color: var(--muted); font-size: 12px; }
</style>
