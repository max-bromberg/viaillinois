<script>
  import { onMount } from 'svelte';
  import { navigate } from '../lib/router.js';
  import { currentUser, authResolved } from '../stores/auth.js';
  import { rememberAfterSignIn } from '../lib/afterSignIn.js';
  import { getLinkSession } from '../api/link.js';
  import { campusTime } from '../lib/campusTime.js';

  /** The session identifier out of the address the bot sent. */
  export let session = '';

  let status = 'loading';
  let expiresAt = null;
  let wantsRoles = true;
  let reason = null;
  let sentToSignIn = false;
  let askedAboutSession = false;

  const card = 'rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3';
  const body = 'text-sm text-muted-foreground leading-relaxed';
  const list = 'text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1';

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

  $: startAddress = `/auth/discord/start?session=${encodeURIComponent(session)}&roles=${wantsRoles ? 1 : 0}`;
  $: canContinue = status === 'open';

  onMount(() => {
    reason = new URLSearchParams(window.location.search).get('reason');
  });

  // Whether somebody is signed in is the answer to a request of its own, and
  // this page is drawn before that answer arrives. Both of these wait for the
  // answer rather than reading whatever was there on mount, because reading it
  // on mount sent a signed in person to sign in again.

  // Somebody who is not signed in signs in first, and comes back here.
  $: if ($authResolved && !$currentUser && !sentToSignIn) {
    sentToSignIn = true;
    rememberAfterSignIn(`/link/discord/${session}`);
    navigate('/login');
  }

  $: if ($authResolved && $currentUser && !askedAboutSession) {
    askedAboutSession = true;
    loadSession();
  }

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
</script>

<svelte:head>
  <title>Link your Discord account: VIA</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="max-w-xl mx-auto space-y-6">
  <div class="{card}">
    <h1 class="text-2xl font-bold tracking-tight">Link your Discord account</h1>

    {#if reason && REASONS[reason]}
      <p class="text-sm rounded-md border border-amber-500/40 bg-amber-500/10 p-3 leading-relaxed">
        {REASONS[reason]}
      </p>
    {/if}

    {#if sentToSignIn || status === 'loading'}
      <p class="{body}">Checking your link request.</p>
    {:else if status === 'expired' || status === 'unknown'}
      <p class="{body}">
        {status === 'expired'
          ? 'This link request has expired. A link request is good for ten minutes, which is short on purpose, because it is what proves the Discord account asking is the one in front of you.'
          : 'This link request is not one VIA opened, or it has already been cleared away.'}
      </p>
      <p class="{body}">Please run the link command on Discord again, and open the new address it sends you.</p>
    {:else if status === 'completed'}
      <p class="{body}">
        This link request has already been used, so your Discord account is linked. You can
        see it and undo it on your <a href="/account" class="underline underline-offset-2">account page</a>.
      </p>
    {:else}
      <p class="{body}">
        You are signed in as <span class="font-medium text-foreground">{$currentUser?.net_id}</span>.
        Linking tells VIA that this NetID and the Discord account that asked to link are the
        same person, so the VIA bot can act on Discord as you.
      </p>

      <div class="space-y-2">
        <p class="text-sm font-medium">What linking lets the bot do</p>
        <ul class="{list}">
          <li>Act as you on VIA for the things you can already do on this website, such as creating an event for an organization whose board you sit on.</li>
          <li>Show you the events and organizations you are a member of, including the ones that are internal to your organization.</li>
        </ul>
      </div>

      <div class="space-y-2">
        <p class="text-sm font-medium">What linking never does</p>
        <ul class="{list}">
          <li>The bot never reads your messages. It has no access to message content anywhere on Discord, and it stores no message text.</li>
          <li>Nothing you do on VIA is posted to Discord as you, and your NetID is never shown to anybody who could not already see it on this website.</li>
          <li>You can undo this at any time, from your account page here or with the unlink command on Discord.</li>
        </ul>
      </div>

      <label class="flex items-start gap-2 text-sm">
        <input type="checkbox" bind:checked={wantsRoles} class="mt-0.5" />
        <span class="{body}">
          Also let VIA publish three linked roles facts to Discord: that you are verified,
          whether you are on the board of an organization, and the day you linked. Servers can
          use those to hand out a role. This part is optional, and you can add or remove it later.
        </span>
      </label>

      <div class="pt-1">
        <a
          href="{startAddress}"
          class="inline-flex items-center justify-center px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Continue to Discord
        </a>
      </div>

      {#if expiresAt && readableTime(expiresAt)}
        <p class="text-xs text-muted-foreground">This request is good until {readableTime(expiresAt)}.</p>
      {/if}
    {/if}
  </div>
</div>
