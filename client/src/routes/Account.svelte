<script>
  import { currentUser } from '../stores/auth.js';
  import { getMe, unlinkDiscord } from '../api/users.js';
  import { showToast } from '../stores/ui.js';

  let confirming = false;
  let working = false;

  const card = 'rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3';
  const body = 'text-sm text-muted-foreground leading-relaxed';

  $: discord = $currentUser?.discord ?? { linked: false, linked_at: null };

  /** The day a link was made, which is as much as anybody needs to see. */
  function readableDate(value) {
    if (!value) return '';
    const at = new Date(value);
    return Number.isNaN(at.getTime())
      ? ''
      : at.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

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

    {#if discord.linked}
      <p class="{body}">
        A Discord account is linked to your VIA account{readableDate(discord.linked_at)
          ? `, since ${readableDate(discord.linked_at)}` : ''}. The VIA bot can act as you on
        Discord for the things you can already do on this website, and it never reads your messages.
      </p>

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
