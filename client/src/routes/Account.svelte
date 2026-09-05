<script>
  import { currentUser, authResolved } from '../stores/auth.js';
  import { getMe, unlinkDiscord } from '../api/users.js';
  import { showToast } from '../stores/ui.js';
  import { navigate } from '../lib/router.js';
  import { campusDate } from '../lib/campusTime.js';
  import { onMount } from 'svelte';

  // There is nothing on this page for somebody who is not signed in, because
  // everything it shows belongs to one account. Whether somebody is signed in
  // is the answer to a request of its own, so this waits for that answer
  // rather than sending a signed in person to sign in again.
  $: if ($authResolved && !$currentUser) navigate('/login');

  let confirming = false;
  let working = false;

  const card = 'rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3';
  const body = 'text-sm text-muted-foreground leading-relaxed';

  $: discord = $currentUser?.discord ?? { linked: false, linked_at: null, roles_published: false };

  /**
   * What came back from the linked roles round trip, in the words the person
   * needs. Each of these arrives as a value on the address, because the server
   * sends people back here rather than writing a page of its own.
   */
  const ROLES_RESULTS = {
    on: 'Discord now has your VIA facts, so a server can give you a role for them. You can take this back at any time by unlinking your Discord account here.',
    declined: 'You did not finish the authorization on Discord, so nothing changed. You can try again whenever you are ready.',
    failed: 'Discord could not confirm who you are just now, so nothing changed. Please try again in a moment.',
    mismatch: 'That authorization was for a different Discord account from the one linked to your VIA account. Please try again with the account you linked.',
    unlinked: 'There is no Discord account linked to your VIA account yet, so there is nothing to publish facts for.',
    signedout: 'You were signed out of VIA while you were on Discord, so nothing changed. Please sign in again and press the button once more.',
  };

  let rolesResult = null;
  onMount(() => {
    rolesResult = new URLSearchParams(window.location.search).get('roles');
  });

  /** Where the optional linked roles step is started, with no link session. */
  const ROLES_ADDRESS = '/auth/discord/start?roles=1';

  /**
   * The day a link was made, which is as much as anybody needs to see, on the
   * campus clock. Rendered in the reader's own zone, a link made in the
   * evening on campus was shown as having been made the following day to
   * anybody reading it from further east.
   */
  const readableDate = value =>
    campusDate(value, { year: 'numeric', month: 'long', day: 'numeric' });

  async function unlink() {
    working = true;
    try {
      await unlinkDiscord();
      const { user } = await getMe();
      currentUser.set(user);
      confirming = false;
      showToast('Your Discord account is no longer linked to VIA.');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      working = false;
    }
  }
</script>

<svelte:head>
  <title>Your account: VIA</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="max-w-xl mx-auto space-y-6">
  <div class="{card}">
    <h1 class="text-2xl font-bold tracking-tight">Your account</h1>
    <p class="{body}">
      You are signed in as <span class="font-medium text-foreground">{$currentUser?.net_id ?? ''}</span>.
    </p>
  </div>

  <div class="{card}">
    <h2 class="text-lg font-semibold">Discord</h2>

    {#if rolesResult && ROLES_RESULTS[rolesResult]}
      <p class="text-sm rounded-md border border-amber-500/40 bg-amber-500/10 p-3 leading-relaxed">
        {ROLES_RESULTS[rolesResult]}
      </p>
    {/if}

    {#if discord.linked}
      <p class="{body}">
        A Discord account is linked to your VIA account{readableDate(discord.linked_at)
          ? `, since ${readableDate(discord.linked_at)}` : ''}. The VIA bot can act as you on
        Discord for the things you can already do on this website, and it never reads your messages.
      </p>

      {#if discord.roles_published}
        <p class="{body}">
          VIA already publishes your linked roles facts to Discord: that you are verified,
          whether you are on the board of an organization, and the day you linked. Unlinking
          your Discord account takes them away again.
        </p>
      {:else}
        <p class="{body}">
          VIA is not publishing any linked roles facts for you. If you would like it to, it
          publishes three and nothing else: that you are verified, whether you are on the board
          of an organization, and the day you linked. A Discord server can use those to give
          you a role.
        </p>
        <div>
          <a
            href="{ROLES_ADDRESS}"
            class="inline-flex items-center justify-center px-3 py-1.5 text-sm border border-input rounded-md hover:bg-accent transition-colors"
          >
            Publish my linked roles facts
          </a>
        </div>
      {/if}

      {#if confirming}
        <p class="{body}">
          Unlinking means the bot stops knowing who you are on Discord, and any role a server
          gave you through VIA can be taken away. You can link again whenever you like.
        </p>
        <div class="flex gap-2">
          <button
            on:click={unlink}
            disabled={working}
            class="px-3 py-1.5 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors disabled:opacity-60"
          >
            Yes, unlink my Discord account
          </button>
          <button
            on:click={() => confirming = false}
            disabled={working}
            class="px-3 py-1.5 text-sm border border-input rounded-md hover:bg-accent transition-colors"
          >
            No, keep it linked
          </button>
        </div>
      {:else}
        <button
          on:click={() => confirming = true}
          class="px-3 py-1.5 text-sm border border-input rounded-md hover:bg-accent transition-colors"
        >
          Unlink my Discord account
        </button>
      {/if}
    {:else}
      <p class="{body}">
        No Discord account is linked to your VIA account. To link one, run the /link command
        on Discord in a server the VIA bot is in, and open the address it sends you.
      </p>
    {/if}
  </div>
</div>
