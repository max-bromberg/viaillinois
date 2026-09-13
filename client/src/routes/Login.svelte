<script>
  import { navigate } from '../lib/router.js';
  import { currentUser } from '../stores/auth.js';
  import { apiFetch } from '../api/base.js';
  import { getMe } from '../api/users.js';
  import { takeAfterSignIn } from '../lib/afterSignIn.js';
  import { Button, Field, Mark } from '../lib/components/ui/index.js';
  import { showToast, pageTitle, bandShowsTitle } from '../stores/ui.js';

  /**
   * Signing in.
   *
   * One primary button for the NetID, which is how almost everybody arrives,
   * and a quiet button for the local account an administrator issues, which
   * stays shut until somebody asks for it. See docs/design/08-surfaces.md.
   *
   * "Sign in" goes in the sky band in place of the greeting, through the store
   * in stores/ui.js, and the page draws its own heading only where the band is
   * not carrying one.
   */
  $effect(() => {
    pageTitle.set('Sign in');
    return () => pageTitle.set(null);
  });

  let netId = $state('');
  let password = $state('');
  let loading = $state(false);
  let showLocalForm = $state(false);

  async function loginLocal() {
    loading = true;
    try {
      await apiFetch('/auth/login', { method: 'POST', body: { netId, password } });
      const { user } = await getMe();
      currentUser.set(user);
      // Somebody sent here from a page that needed an account, such as the
      // Discord link address, goes back to it rather than to the feed.
      navigate(takeAfterSignIn() ?? '/');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      loading = false;
    }
  }

  function loginMicrosoft() {
    window.location.href = '/auth/microsoft';
  }
</script>

<svelte:head>
  <title>Sign in: VIA</title>
</svelte:head>

<div class="signin">
  <Mark size={72} />
  {#if !$bandShowsTitle}<h1>Sign in</h1>{/if}
  <p>
    VIA knows you by your NetID, which is how it knows which organizations you are on the
    board of. Reading the event feed needs no account at all.
  </p>

  <div class="ways">
    <Button variant="primary" onclick={loginMicrosoft}>Sign in with your NetID</Button>

    <Button
      variant="quiet"
      aria-expanded={showLocalForm}
      onclick={() => { showLocalForm = !showLocalForm; }}
    >
      {showLocalForm ? 'Hide the password form' : 'Sign in with a VIA password'}
    </Button>
  </div>

  {#if showLocalForm}
    <form onsubmit={event => { event.preventDefault(); loginLocal(); }}>
      <p class="note">
        A VIA password is issued by an administrator, for the few people who have no NetID.
      </p>
      <Field label="Username" id="netId" bind:value={netId} autocomplete="username" required />
      <Field
        label="Password"
        id="password"
        type="password"
        bind:value={password}
        autocomplete="current-password"
        required
      />
      <Button type="submit" variant="secondary" busy={loading}>Sign in</Button>
    </form>
  {/if}
</div>

<style>
  .signin {
    max-width: 62ch;
    margin: 0 auto;
    padding: 40px 0 64px;
    display: grid;
    justify-items: start;
    gap: 18px;
  }

  /* The page title role: condensed 800 at 56 px. */
  h1 {
    font-family: var(--display);
    font-stretch: 75%;
    font-variation-settings: "opsz" 96;
    font-weight: 800;
    font-size: 56px;
    line-height: 0.9;
    letter-spacing: 0.006em;
    color: var(--ink);
    margin: 0;
  }

  p {
    font-family: var(--sans);
    font-size: 15px;
    line-height: 1.55;
    color: var(--ink-2);
    max-width: 52ch;
    margin: 0;
  }

  .ways {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 22px;
    margin-top: 6px;
  }

  form {
    display: grid;
    justify-items: start;
    gap: 20px;
    margin-top: 10px;
    padding-top: 22px;
    border-top: 1px solid var(--line);
    width: 100%;
  }

  .note {
    font-size: 13.5px;
    color: var(--muted);
  }

  @media (max-width: 640px) {
    h1 {
      font-size: 40px;
    }
  }
</style>
