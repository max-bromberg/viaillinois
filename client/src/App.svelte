<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { currentPath, matchRoute, navigate } from './lib/router.js';
  import { currentUser, authResolved } from './stores/auth.js';
  import { themeMode } from './stores/theme.js';
  import { getMe } from './api/users.js';
  import { takeAfterSignIn } from './lib/afterSignIn.js';
  import AppChrome   from './lib/AppChrome.svelte';
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
  import { Toast } from './lib/components/ui/index.js';
  import { apiFetch } from './api/base.js';
  import { greetingCounts } from './lib/greeting.js';
  import { getEvents } from './api/events.js';
  import { getConfirmedMidterms } from './api/midterms.js';

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

  /**
   * The class is the mechanism the client has always used and the one every
   * unconverted screen reads. The attribute is what the design system's
   * stylesheet reads, and it is what keeps the dark media query in app.css from
   * overruling somebody who asked for the light theme on a system set to dark.
   * index.html writes both before first paint, and this keeps them in step.
   */
  function applyTheme(mode, prefersDark) {
    const isDark = mode === 'dark' || (mode === 'auto' && prefersDark);
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }

  /**
   * What the greeting says. The feed asks for the events it is about to draw
   * anyway, so the counts come from one more small request rather than from a
   * number the client makes up, and a count that has not arrived is left out.
   */
  let greeting = { tonight: null, week: null, midterm: null };

  async function readGreeting() {
    const [events, midterms] = await Promise.allSettled([
      getEvents({ timeframe: 'upcoming', limit: 100, offset: 0 }),
      getConfirmedMidterms(),
    ]);
    greeting = greetingCounts({
      events: events.status === 'fulfilled' ? events.value.events ?? [] : [],
      midterms: midterms.status === 'fulfilled' ? midterms.value.midterms ?? [] : [],
    });
  }

  async function signOut() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {}
    currentUser.set(null);
    navigate('/');
  }

  onMount(async () => {
    readGreeting();
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
    <div class="toast-corner">
      <!--
        An error stays until it is dismissed, because a sentence saying the feed
        did not load should still be there when the reader looks up.
      -->
      <Toast
        message={$toast.message}
        tone={$toast.type === 'error' ? 'signal' : 'primary'}
        duration={$toast.type === 'error' ? 0 : 6000}
        ondismiss={() => toast.set(null)}
      />
    </div>
  {/if}

  <div class="min-h-screen relative z-10 flex flex-col">
    <a class="skip" href="#agenda">Skip to the agenda</a>
    <AppChrome
      here={$currentPath}
      counts={greeting}
      onnavigate={navigate}
      onsignout={signOut}
    />
    <main id="agenda" class="page-body flex-1">
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
      {:else if $currentPath === '/about' || dynamicRoute?.name === 'about-tab'}
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

<style>
  /*
   * The band is the first thing on the page and it is tall, so anybody moving
   * by keyboard gets a way past it to the agenda. It shows itself when it is
   * reached and stays out of the way otherwise.
   */
  .skip {
    position: absolute;
    left: -9999px;
    top: 0;
    z-index: 60;
    background: var(--ink);
    color: var(--paper);
    padding: 10px 16px;
    font-family: var(--display);
    font-stretch: 85%;
    font-weight: 700;
  }

  .skip:focus {
    left: 0;
  }

  .page-body {
    max-width: 1180px;
    margin: 0 auto;
    width: 100%;
    padding: 28px 32px 34px;
  }

  @media (max-width: 640px) {
    .page-body {
      padding: 20px 16px 28px;
    }
  }

  .toast-corner {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 50;
  }
</style>
