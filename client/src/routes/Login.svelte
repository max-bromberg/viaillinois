<script>
  import { navigate } from '../lib/router.js';
  import { currentUser } from '../stores/auth.js';
  import { apiFetch } from '../api/base.js';
  import { getMe } from '../api/users.js';
  import { takeAfterSignIn } from '../lib/afterSignIn.js';
  import { showToast } from '../stores/ui.js';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';

  let netId = '';
  let password = '';
  let loading = false;
  let showLocalForm = false;

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

<div class="min-h-[80vh] flex items-center justify-center">
  <div class="w-full max-w-sm space-y-6">
    <div class="text-center space-y-2">
      <img src="/via_logo_black.svg" alt="VIA" class="h-10 w-auto mx-auto" />
      <p class="text-muted-foreground text-sm">Virtually Integrated Agenda</p>
    </div>

    <div class="space-y-3">
      <Button class="w-full" on:click={loginMicrosoft}>
        Sign in with UIUC NetID
      </Button>

      <button
        class="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        on:click={() => showLocalForm = !showLocalForm}
      >
        {showLocalForm ? 'Hide' : 'Use password login (non-UIUC users)'}
      </button>

      {#if showLocalForm}
        <form on:submit|preventDefault={loginLocal} class="space-y-3 pt-2 border-t">
          <div class="space-y-1">
            <Label htmlFor="netId">Username</Label>
            <Input id="netId" bind:value={netId} placeholder="username" autocomplete="username" required />
          </div>
          <div class="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" bind:value={password} autocomplete="current-password" required />
          </div>
          <Button type="submit" class="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      {/if}
    </div>
  </div>
</div>
