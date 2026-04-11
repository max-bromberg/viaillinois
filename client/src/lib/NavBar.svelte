<script>
  import { navigate } from 'svelte-routing';
  import { currentUser, isGlobalAdmin } from '../stores/auth.js';
  import { apiFetch } from '../api/base.js';

  async function logout() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Handle error gracefully
    }
    currentUser.set(null);
    navigate('/');
  }
</script>

<nav class="border-b bg-background/95 backdrop-blur sticky top-0 z-40">
  <div class="container mx-auto px-4 h-14 flex items-center justify-between">
    <div class="flex items-center gap-6">
      <a href="/" on:click|preventDefault={() => navigate('/')} class="flex items-center gap-2 group">
        <img src="/via_logo_black.svg" alt="VIA" class="h-5 w-auto" />
        <span class="overflow-hidden max-w-0 group-hover:max-w-[14rem] opacity-0 group-hover:opacity-100 transition-[max-width,opacity] duration-500 ease-in-out whitespace-nowrap text-sm text-muted-foreground italic">
          Virtually Integrated Agenda
        </span>
      </a>
      <a href="/" on:click|preventDefault={() => navigate('/')} class="text-sm text-muted-foreground hover:text-foreground transition-colors">Events</a>
      <a href="/midterms" on:click|preventDefault={() => navigate('/midterms')} class="text-sm text-muted-foreground hover:text-foreground transition-colors">Midterms</a>
      {#if $currentUser}
        <a href="/dashboard" on:click|preventDefault={() => navigate('/dashboard')} class="text-sm text-muted-foreground hover:text-foreground transition-colors">Dashboard</a>
      {/if}
      {#if $isGlobalAdmin}
        <a href="/admin" on:click|preventDefault={() => navigate('/admin')} class="text-sm text-muted-foreground hover:text-foreground transition-colors">Admin</a>
      {/if}
    </div>
    <div class="flex items-center gap-3">
      {#if $currentUser}
        <span class="text-sm text-muted-foreground">{$currentUser.net_id}</span>
        <button on:click={logout} class="px-3 py-1.5 text-sm border border-input rounded-md hover:bg-accent transition-colors">
          Sign out
        </button>
      {:else}
        <button on:click={() => navigate('/login')} class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
          Sign in
        </button>
      {/if}
      <button on:click={() => navigate('/kiosk')} class="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        Kiosk
      </button>
    </div>
  </div>
</nav>
