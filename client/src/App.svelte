<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { currentPath, matchRoute, navigate } from './lib/router.js';
  import { currentUser, authResolved } from './stores/auth.js';
  import { themeMode } from './stores/theme.js';
  import { getMe } from './api/users.js';
  import { takeAfterSignIn } from './lib/afterSignIn.js';
  import NavBar      from './lib/NavBar.svelte';
  // The feed is what most visits are for, so it travels with the first
  // download. Every other page is its own file, fetched when somebody opens it,
  // which keeps the logistics dashboard, the scheduler and the poster designer
  // out of the download a student makes to read what is on this week.
  import Home        from './routes/Home.svelte';
  import LazyRoute   from './lib/LazyRoute.svelte';
  import AppSkeleton from './lib/AppSkeleton.svelte';
  import Footer      from './lib/Footer.svelte';
  import { toast } from './stores/ui.js';
  import CircuitBackground from './lib/CircuitBackground.svelte';

  let authLoading = true;
  $: dynamicRoute = matchRoute($currentPath);

  /**
   * Pages that exist only for somebody signed in, and send anyone else to the
   * login page. Those wait until the answer to who is looking comes back,
   * because drawing one before it arrives sends a board member to a login page
   * they are already past.
   *
   * Every other page draws straight away. A visit to the feed used to hold the
   * whole screen, and the feed's own request, behind a round trip the reader
   * has no interest in.
   */
  const NEEDS_ACCOUNT = ['/dashboard', '/admin', '/scheduler', '/poster', '/account'];
  $: waitingForAccount = authLoading && NEEDS_ACCOUNT.includes($currentPath);

  function applyTheme(mode, prefersDark) {
    const isDark = mode === 'dark' || (mode === 'auto' && prefersDark);
    document.documentElement.classList.toggle('dark', isDark);
  }

  onMount(async () => {
    // Theme: subscribe to store and system preference. Guarded, because
    // whether the reader prefers a dark page is not worth holding the page
    // itself for: a browser without media query support used to leave the
    // account check below unreached and the screen on its skeleton forever.
    let unsubTheme = () => {};
    let mq = null;
    let onSystemChange = () => {};
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
      unsubTheme = themeMode.subscribe(mode => applyTheme(mode, mq.matches));
      onSystemChange = () => { if (get(themeMode) === 'auto') applyTheme('auto', mq.matches); };
      mq.addEventListener('change', onSystemChange);
    } catch {
      unsubTheme = themeMode.subscribe(mode => applyTheme(mode, false));
    }

    // Auth
    try {
      const { user } = await getMe();
      currentUser.set(user);
      // Somebody who followed a link address while signed out was sent to sign
      // in, and signing in with a NetID ends up back at the front page, so
      // they are put back on the address they were headed for.
      const headedFor = takeAfterSignIn();
      if (headedFor) navigate(headedFor);
    } catch {
      // Not logged in, which is fine for public routes
    } finally {
      authLoading = false;
      authResolved.set(true);
    }

    return () => {
      unsubTheme();
      mq?.removeEventListener('change', onSystemChange);
    };
  });
</script>

{#if waitingForAccount}
  <AppSkeleton />
{:else if $currentPath.startsWith('/kiosk')}
  <LazyRoute load={() => import('./routes/Kiosk.svelte')} />
{:else}
  <CircuitBackground />

  {#if $toast}
    <div class="fixed top-4 right-4 z-50 rounded-md px-4 py-2 text-sm font-medium shadow-md
      {$toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}">
      {$toast.message}
    </div>
  {/if}

  <div class="min-h-screen bg-background/60 text-foreground relative z-10 flex flex-col">
    <NavBar />
    <main class="container mx-auto px-4 py-6 flex-1">
      {#if $currentPath === '/'}
        <Home />
      {:else if $currentPath === '/dashboard'}
        <LazyRoute load={() => import('./routes/Dashboard.svelte')} />
      {:else if $currentPath === '/midterms'}
        <LazyRoute load={() => import('./routes/Midterms.svelte')} />
      {:else if $currentPath === '/login'}
        <LazyRoute load={() => import('./routes/Login.svelte')} />
      {:else if $currentPath === '/admin'}
        <LazyRoute load={() => import('./routes/Admin.svelte')} />
      {:else if $currentPath === '/calendar'}
        <LazyRoute load={() => import('./routes/Calendar.svelte')} />
      {:else if $currentPath === '/about'}
        <LazyRoute load={() => import('./routes/About.svelte')} />
      {:else if $currentPath === '/scheduler'}
        <LazyRoute load={() => import('./routes/Scheduler.svelte')} />
      {:else if $currentPath === '/poster'}
        <LazyRoute load={() => import('./routes/Poster.svelte')} />
      {:else if $currentPath === '/updates'}
        <LazyRoute load={() => import('./routes/Updates.svelte')} />
      {:else if dynamicRoute?.name === 'update-detail'}
        <LazyRoute
          load={() => import('./routes/UpdateDetail.svelte')}
          props={{ slug: dynamicRoute.params.slug }}
        />
      {:else if dynamicRoute?.name === 'event-detail'}
        <LazyRoute
          load={() => import('./routes/EventDetail.svelte')}
          props={{ id: parseInt(dynamicRoute.params.id) }}
        />
      {:else if $currentPath === '/account'}
        <LazyRoute load={() => import('./routes/Account.svelte')} />
      {:else if dynamicRoute?.name === 'link-discord'}
        <LazyRoute
          load={() => import('./routes/LinkDiscord.svelte')}
          props={{ session: dynamicRoute.params.session }}
        />
      {:else if dynamicRoute?.name === 'link-discord-done'}
        <LazyRoute load={() => import('./routes/LinkDiscordDone.svelte')} />
      {:else if $currentPath === '/terms'}
        <LazyRoute load={() => import('./routes/Terms.svelte')} />
      {:else if $currentPath === '/privacy'}
        <LazyRoute load={() => import('./routes/Privacy.svelte')} />
      {/if}
    </main>
    <Footer />
  </div>
{/if}
