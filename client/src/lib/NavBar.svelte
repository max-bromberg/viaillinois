<script>
  import { navigate } from './router.js';
  import { currentUser, authResolved, isGlobalAdmin, adminRsoIds } from '../stores/auth.js';
  import { themeMode } from '../stores/theme.js';
  import { apiFetch } from '../api/base.js';

  let menuOpen = false;

  function go(path) {
    navigate(path);
    menuOpen = false;
  }

  async function logout() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {}
    currentUser.set(null);
    navigate('/');
    menuOpen = false;
  }
</script>

<nav class="border-b bg-background/95 backdrop-blur sticky top-0 z-40">
  <div class="container mx-auto px-4 h-14 flex items-center justify-between gap-4">

    <!-- Logo -->
    <a href="/" on:click|preventDefault={() => go('/')} class="flex items-center gap-2 group shrink-0">
      <img src="/via_logo_black.svg" alt="VIA" class="h-5 w-auto" />
      <span class="hidden sm:block overflow-hidden max-w-0 group-hover:max-w-[14rem] opacity-0 group-hover:opacity-100 transition-[max-width,opacity] duration-500 ease-in-out whitespace-nowrap text-sm text-muted-foreground italic">
        Virtually Integrated Agenda
      </span>
    </a>

    <!-- Desktop nav links -->
    <div class="hidden md:flex items-center gap-5 flex-1">
      <a href="/"          on:click|preventDefault={() => go('/')}          class="text-sm text-muted-foreground hover:text-foreground transition-colors">Events</a>
      <a href="/calendar"  on:click|preventDefault={() => go('/calendar')}  class="text-sm text-muted-foreground hover:text-foreground transition-colors">Calendar</a>
      <a href="/midterms"  on:click|preventDefault={() => go('/midterms')}  class="text-sm text-muted-foreground hover:text-foreground transition-colors">Midterms</a>
      <a href="/updates"   on:click|preventDefault={() => go('/updates')}   class="text-sm text-muted-foreground hover:text-foreground transition-colors">Updates</a>
      <a href="/about"     on:click|preventDefault={() => go('/about')}     class="text-sm text-muted-foreground hover:text-foreground transition-colors">About</a>
      {#if $currentUser}
        <a href="/dashboard" on:click|preventDefault={() => go('/dashboard')} class="text-sm text-muted-foreground hover:text-foreground transition-colors">Dashboard</a>
      {/if}
      {#if $isGlobalAdmin}
        <a href="/admin"   on:click|preventDefault={() => go('/admin')}     class="text-sm text-muted-foreground hover:text-foreground transition-colors">Admin</a>
      {/if}
    </div>

    <!-- Desktop right side -->
    <div class="hidden md:flex items-center gap-3">
      <!-- Smart Scheduler shortcut (RSO admins/editors only) -->
      {#if $adminRsoIds.length > 0}
        <button
          on:click={() => go('/scheduler')}
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
          Schedule
        </button>
      {/if}
      <!-- Theme toggle -->
      <div class="flex border rounded-md overflow-hidden text-xs" title="Color theme">
        <button
          class="px-2 py-1.5 transition-colors {$themeMode === 'light' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}"
          on:click={() => themeMode.set('light')} aria-label="Light mode" title="Light"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
          </svg>
        </button>
        <button
          class="px-2 py-1.5 border-l transition-colors {$themeMode === 'auto' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}"
          on:click={() => themeMode.set('auto')} aria-label="Auto (system) mode" title="Auto"
        >Auto</button>
        <button
          class="px-2 py-1.5 border-l transition-colors {$themeMode === 'dark' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}"
          on:click={() => themeMode.set('dark')} aria-label="Dark mode" title="Dark"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>
      </div>

      <!--
        Nothing until the answer to who is looking arrives. Showing Sign in
        first and correcting it a moment later is a flicker on every page a
        signed in board member opens.
      -->
      {#if !$authResolved}
        <span class="w-20"></span>
      {:else if $currentUser}
        <a
          href="/account"
          on:click|preventDefault={() => go('/account')}
          class="text-sm text-muted-foreground hover:text-foreground transition-colors"
          title="Your account"
        >{$currentUser.net_id}</a>
        <button on:click={logout} class="px-3 py-1.5 text-sm border border-input rounded-md hover:bg-accent transition-colors">Sign out</button>
      {:else}
        <button on:click={() => go('/login')} class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">Sign in</button>
      {/if}
    </div>

    <!-- Mobile hamburger -->
    <button
      class="md:hidden p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground"
      on:click={() => menuOpen = !menuOpen}
      aria-label={menuOpen ? 'Close menu' : 'Open menu'}
    >
      {#if menuOpen}
        <!-- X -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      {:else}
        <!-- Hamburger -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12h18M3 6h18M3 18h18"/>
        </svg>
      {/if}
    </button>
  </div>

  <!-- Mobile dropdown menu -->
  {#if menuOpen}
    <div class="md:hidden border-t bg-background/95 backdrop-blur">
      <div class="container mx-auto px-4 py-3 flex flex-col gap-1">
        <a href="/"          on:click|preventDefault={() => go('/')}          class="px-2 py-2 text-sm rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">Events</a>
        <a href="/calendar"  on:click|preventDefault={() => go('/calendar')}  class="px-2 py-2 text-sm rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">Calendar</a>
        <a href="/midterms"  on:click|preventDefault={() => go('/midterms')}  class="px-2 py-2 text-sm rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">Midterms</a>
        <a href="/updates"   on:click|preventDefault={() => go('/updates')}   class="px-2 py-2 text-sm rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">Updates</a>
        <a href="/about"     on:click|preventDefault={() => go('/about')}     class="px-2 py-2 text-sm rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">About</a>
        {#if $currentUser}
          <a href="/dashboard" on:click|preventDefault={() => go('/dashboard')} class="px-2 py-2 text-sm rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">Dashboard</a>
        {/if}
        {#if $isGlobalAdmin}
          <a href="/admin"   on:click|preventDefault={() => go('/admin')}     class="px-2 py-2 text-sm rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">Admin</a>
        {/if}
        {#if $adminRsoIds.length > 0}
          <button
            on:click={() => go('/scheduler')}
            class="flex items-center gap-1.5 px-2 py-2 text-sm rounded-md text-primary font-medium hover:bg-accent transition-colors w-full text-left"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            Smart Scheduler
          </button>
        {/if}

        <div class="border-t my-1"></div>

        <!-- Theme toggle (mobile) -->
        <div class="px-2 py-1 flex items-center justify-between">
          <span class="text-xs text-muted-foreground">Theme</span>
          <div class="flex border rounded-md overflow-hidden text-xs">
            <button
              class="px-2.5 py-1.5 transition-colors {$themeMode === 'light' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}"
              on:click={() => themeMode.set('light')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="4"/>
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
              </svg>
            </button>
            <button
              class="px-2.5 py-1.5 border-l transition-colors {$themeMode === 'auto' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}"
              on:click={() => themeMode.set('auto')}
            >Auto</button>
            <button
              class="px-2.5 py-1.5 border-l transition-colors {$themeMode === 'dark' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}"
              on:click={() => themeMode.set('dark')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Auth (mobile) -->
        <div class="border-t my-1"></div>
        <div class="px-2 py-1">
          {#if $currentUser}
            <div class="flex items-center justify-between">
              <a
                href="/account"
                on:click|preventDefault={() => go('/account')}
                class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >{$currentUser.net_id}</a>
              <button on:click={logout} class="px-3 py-1.5 text-sm border border-input rounded-md hover:bg-accent transition-colors">Sign out</button>
            </div>
          {:else}
            <button on:click={() => go('/login')} class="w-full px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">Sign in</button>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</nav>
