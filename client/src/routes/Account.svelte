<script>
  import { onMount } from 'svelte';
  import { currentUser, authResolved } from '../stores/auth.js';
  import { getMe, unlinkDiscord } from '../api/users.js';
  import { showToast } from '../stores/ui.js';
  import { navigate } from '../lib/router.js';
  import { campusDate } from '../lib/campusTime.js';
  import ReadingPage from '../lib/ReadingPage.svelte';
  import { Button, Field, Pad } from '../lib/components/ui/index.js';

  /**
   * Your account.
   *
   * A reading page with a field for each setting. The one setting here is the
   * NetID, which arrives from the University sign in and is read rather than
   * typed, and the one thing a person can do on this page is undo a Discord
   * link that was made somewhere else.
   *
   * The link state is drawn as a filled pad and a sentence, and a change to it
   * is said in a toast, which is what the rest of the site does when something
   * happens. See docs/design/08-surfaces.md.
   */

  // There is nothing on this page for somebody who is not signed in, because
  // everything it shows belongs to one account. Whether somebody is signed in
  // is the answer to a request of its own, so this waits for that answer
  // rather than sending a signed in person to sign in again.
  $effect(() => {
    if ($authResolved && !$currentUser) navigate('/login');
  });

  let confirming = $state(false);
  let working = $state(false);

  const discord = $derived($currentUser?.discord ?? { linked: false, linked_at: null, roles_published: false });

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

  onMount(() => {
    const result = new URLSearchParams(window.location.search).get('roles');
    /*
     * Object.hasOwn, because this name comes off the address bar. Every plain
     * object inherits constructor, toString and the rest from Object.prototype,
     * so a plain lookup let anybody hand a reader a link that put the source of
     * a function into a toast on their own account page.
     */
    if (result === null || !Object.hasOwn(ROLES_RESULTS, result)) return;
    const said = ROLES_RESULTS[result];
    // Everything but the one that worked stays until it is read, because a
    // sentence saying nothing changed should still be there when the reader
    // looks up.
    showToast(said, result === 'on' ? 'success' : 'error');
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

  const linkedOn = $derived(discord.linked ? readableDate(discord.linked_at) : '');

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

<ReadingPage title="Your account">
  <p>
    This is what VIA holds about your account, and the one place to undo the Discord link.
    The rest of what you can do on the site depends on which organizations you are on the
    board of, and a board sets that on its own page.
  </p>

  <div class="setting">
    <Field
      label="NetID"
      id="account-net-id"
      value={$currentUser?.net_id ?? ''}
      readonly
      help="This is how VIA knows you. It comes from the University sign in and is not changed here."
    />
  </div>

  <section>
    <h2>Discord</h2>

    {#if discord.linked}
      <p class="state">
        <Pad lit />
        <span>
          A Discord account is linked to your VIA account{linkedOn ? `, since ${linkedOn}` : ''}.
          The VIA bot can act as you on Discord for the things you can already do on this
          website, and it never reads your messages.
        </span>
      </p>

      {#if discord.roles_published}
        <p>
          VIA already publishes your linked roles facts to Discord: that you are verified,
          whether you are on the board of an organization, and the day you linked. Unlinking
          your Discord account takes them away again.
        </p>
      {:else}
        <p>
          VIA is not publishing any linked roles facts for you. If you would like it to, it
          publishes three and nothing else: that you are verified, whether you are on the
          board of an organization, and the day you linked. A Discord server can use those to
          give you a role.
        </p>
        <p class="act">
          <Button variant="primary" href={ROLES_ADDRESS}>Publish my linked roles facts</Button>
        </p>
      {/if}

      {#if confirming}
        <p>
          Unlinking means the bot stops knowing who you are on Discord, and any role a server
          gave you through VIA can be taken away. You can link again whenever you like.
        </p>
        <p class="act">
          <Button variant="danger" busy={working} onclick={unlink}>
            Yes, unlink my Discord account
          </Button>
          <Button variant="secondary" disabled={working} onclick={() => { confirming = false; }}>
            No, keep it linked
          </Button>
        </p>
      {:else}
        <p class="act">
          <Button variant="danger" onclick={() => { confirming = true; }}>
            Unlink my Discord account
          </Button>
        </p>
      {/if}
    {:else}
      <p class="state">
        <Pad hollow />
        <span>
          No Discord account is linked to your VIA account. To link one, run the /link command
          on Discord in a server the VIA bot is in, and open the address it sends you.
        </span>
      </p>
    {/if}
  </section>
</ReadingPage>

<style>
  .setting {
    margin-top: 26px;
  }

  /*
   * The link state: a filled pad and a sentence, which is how the site says
   * what is on without drawing a box round it.
   */
  .state {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .state :global(.pad) {
    margin-top: 7px;
    flex: none;
  }

  /* A line of controls under the prose takes the same rhythm the prose does. */
  .act {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 18px;
  }
</style>
