<script>
  import { onMount } from 'svelte';
  import { navigate } from '../lib/router.js';
  import { currentUser, authResolved } from '../stores/auth.js';
  import { rememberAfterSignIn } from '../lib/afterSignIn.js';
  import { getLinkSession } from '../api/link.js';
  import { campusTime } from '../lib/campusTime.js';
  import ReadingPage from '../lib/ReadingPage.svelte';
  import { Button, Switch, Pad } from '../lib/components/ui/index.js';

  /**
   * The page a person lands on from a direct message the bot sent them.
   *
   * It has one job, which is to let somebody say yes with their eyes open: what
   * the bot will be able to do as them, what it will never do, and that they
   * can undo it whenever they want. It is a reading page for that reason, with
   * one primary button at the end of the reading.
   *
   * The optional linked roles step is a preference, so it is a switch, and a
   * refusal on the way back from Discord is a sentence with a pad beside it
   * rather than a coloured box.
   */

  /** The session identifier out of the address the bot sent. */
  let { session = '' } = $props();

  let status = $state('loading');
  let expiresAt = $state(null);
  let wantsRoles = $state(true);
  let reason = $state(null);
  let sentToSignIn = $state(false);
  let askedAboutSession = $state(false);

  /**
   * What a refusal on the way back from Discord means, in the words the person
   * needs. Every one of these arrives as a reason on the address, because the
   * server sends people back here rather than writing its own page.
   */
  const REASONS = {
    state: 'That link address could not be read. Please run the link command on Discord again.',
    mismatch: 'That link address was opened by a different Discord account from the one that asked to link. Please run the link command again from the account you want to link.',
    expired: 'That link request has expired. Please run the link command on Discord again.',
    completed: 'That link request has already been used. Your Discord account is linked, and you can check it on your account page.',
    unknown: 'That link request is not one VIA opened. Please run the link command on Discord again.',
    discord: 'Discord could not confirm who you are just now. Please try again in a moment.',
    declined: 'You did not finish the authorization on Discord, so nothing was linked. You can try again whenever you are ready.',
    signedout: 'You were signed out of VIA while you were on Discord, so nothing was linked. Please sign in again and press the button once more.',
  };

  const startAddress = $derived(
    `/auth/discord/start?session=${encodeURIComponent(session)}&roles=${wantsRoles ? 1 : 0}`,
  );

  onMount(() => {
    reason = new URLSearchParams(window.location.search).get('reason');
  });

  // Whether somebody is signed in is the answer to a request of its own, and
  // this page is drawn before that answer arrives. Both of these wait for the
  // answer rather than reading whatever was there on mount, because reading it
  // on mount sent a signed in person to sign in again.

  // Somebody who is not signed in signs in first, and comes back here.
  $effect(() => {
    if ($authResolved && !$currentUser && !sentToSignIn) {
      sentToSignIn = true;
      rememberAfterSignIn(`/link/discord/${session}`);
      navigate('/login');
    }
  });

  $effect(() => {
    if ($authResolved && $currentUser && !askedAboutSession) {
      askedAboutSession = true;
      loadSession();
    }
  });

  /** What the server says about this session, which decides what the page offers. */
  async function loadSession() {
    try {
      const answer = await getLinkSession(session);
      status = answer.status;
      expiresAt = answer.expires_at ?? null;
    } catch {
      status = 'unknown';
    }
  }

  /**
   * The expiry, as a time somebody can read, on the campus clock. Rendered in
   * the reader's own zone, it named an hour that this request does not run out
   * at for anybody who is not on campus.
   */
  const readableTime = value => campusTime(value);

  const runsOutAt = $derived(expiresAt ? readableTime(expiresAt) : '');
</script>

<svelte:head>
  <title>Link your Discord account: VIA</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<ReadingPage title="Link your Discord account">
  {#if reason && REASONS[reason]}
    <p class="said">
      <Pad tone="var(--signal)" lit />
      <span>{REASONS[reason]}</span>
    </p>
  {/if}

  {#if sentToSignIn || status === 'loading'}
    <p>Checking your link request.</p>
  {:else if status === 'expired' || status === 'unknown'}
    <p>
      {status === 'expired'
        ? 'This link request has expired. A link request is good for ten minutes, which is short on purpose, because it is what proves the Discord account asking is the one in front of you.'
        : 'This link request is not one VIA opened, or it has already been cleared away.'}
    </p>
    <p>Please run the link command on Discord again, and open the new address it sends you.</p>
  {:else if status === 'completed'}
    <p>
      This link request has already been used, so your Discord account is linked. You can
      see it and undo it on your <a href="/account">account page</a>.
    </p>
  {:else}
    <p>
      You are signed in as <strong>{$currentUser?.net_id}</strong>. Linking tells VIA that
      this NetID and the Discord account that asked to link are the same person, so the VIA
      bot can act on Discord as you.
    </p>

    <section>
      <h2>What linking lets the bot do</h2>
      <ul>
        <li>Act as you on VIA for the things you can already do on this website, such as creating an event for an organization whose board you sit on.</li>
        <li>Show you the events and organizations you are a member of, including the ones that are internal to your organization.</li>
      </ul>
    </section>

    <section>
      <h2>What linking never does</h2>
      <ul>
        <li>The bot never reads your messages. It has no access to message content anywhere on Discord, and it stores no message text.</li>
        <li>Nothing you do on VIA is posted to Discord as you, and your NetID is never shown to anybody who could not already see it on this website.</li>
        <li>You can undo this at any time, from your account page here or with the unlink command on Discord.</li>
      </ul>
    </section>

    <div class="pref">
      <Switch label="Publish my linked roles facts to Discord" bind:checked={wantsRoles} />
      <div>
        <p class="what">Publish my linked roles facts to Discord</p>
        <p>
          VIA publishes three facts and nothing else: that you are verified, whether you are
          on the board of an organization, and the day you linked. A server can use those to
          hand you a role. This part is optional, and you can add it or remove it later.
        </p>
      </div>
    </div>

    <p class="act">
      <Button variant="primary" href={startAddress}>Continue to Discord</Button>
    </p>

    {#if runsOutAt}
      <p class="runs-out mono">This request is good until {runsOutAt}.</p>
    {/if}
  {/if}
</ReadingPage>

<style>
  /*
   * What came back from Discord: a sentence with a pad beside it, which is how
   * the site says something without drawing a box round it.
   */
  .said {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    color: var(--ink);
  }

  .said :global(.pad) {
    margin-top: 7px;
    flex: none;
  }

  /* The preference: the switch, then its name, then what it means. */
  .pref {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    margin-top: 32px;
    max-width: 62ch;
  }

  .pref :global(.tswitch) {
    margin-top: 4px;
    flex: none;
  }

  .pref :global(.tswitch:focus-visible) {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  .what {
    font-family: var(--display);
    font-stretch: 80%;
    font-variation-settings: "opsz" 96;
    font-weight: 700;
    font-size: 14px;
    color: var(--ink);
    margin: 0;
  }

  .act {
    margin-top: 30px;
  }

  .runs-out {
    font-size: 12.5px;
    color: var(--muted);
    margin-top: 14px;
  }
</style>
