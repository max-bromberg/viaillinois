<script>
  import ReadingPage from '../lib/ReadingPage.svelte';
  import { Pad } from '../lib/components/ui/index.js';

  /**
   * Where somebody lands once the link is made.
   *
   * A reading page with the state drawn the way the account page draws it: a
   * filled pad and a sentence saying what is true now.
   */
</script>

<svelte:head>
  <title>Your Discord account is linked: VIA</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<ReadingPage title="Your Discord account is linked">
  <p class="state">
    <Pad lit />
    <span>
      You can go back to Discord now. The VIA bot has sent you a direct message, and every
      command you run from here on knows who you are.
    </span>
  </p>
  <p>
    If you change your mind, you can undo this at any time from your
    <a href="/account">account page</a>, or with the unlink command on Discord.
  </p>
</ReadingPage>

<style>
  .state {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    color: var(--ink);
  }

  .state :global(.pad) {
    margin-top: 7px;
    flex: none;
  }
</style>
