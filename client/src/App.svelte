<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { currentPath, matchRoute } from './lib/router.js';
  import EventDetail from './routes/EventDetail.svelte';
  import { currentUser } from './stores/auth.js';
  import { themeMode } from './stores/theme.js';
  import { getMe } from './api/users.js';
  import NavBar      from './lib/NavBar.svelte';
  import Home        from './routes/Home.svelte';
  import Dashboard   from './routes/Dashboard.svelte';
  import Midterms    from './routes/Midterms.svelte';
  import Kiosk       from './routes/Kiosk.svelte';
  import Login       from './routes/Login.svelte';
  import Admin       from './routes/Admin.svelte';
  import Calendar    from './routes/Calendar.svelte';
  import About        from './routes/About.svelte';
  import Scheduler    from './routes/Scheduler.svelte';
  import Poster       from './routes/Poster.svelte';
  import Updates      from './routes/Updates.svelte';
  import UpdateDetail from './routes/UpdateDetail.svelte';
  import Terms        from './routes/Terms.svelte';
  import Privacy      from './routes/Privacy.svelte';
  import AppSkeleton from './lib/AppSkeleton.svelte';
  import Footer      from './lib/Footer.svelte';
  import { toast } from './stores/ui.js';
  import CircuitBackground from './lib/CircuitBackground.svelte';

  let authLoading = true;
  $: dynamicRoute = matchRoute($currentPath);

  function applyTheme(mode, prefersDark) {
    const isDark = mode === 'dark' || (mode === 'auto' && prefersDark);
    document.documentElement.classList.toggle('dark', isDark);
  }

  onMount(async () => {
    // Theme: subscribe to store and system preference
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const unsubTheme = themeMode.subscribe(mode => applyTheme(mode, mq.matches));
    const onSystemChange = () => { if (get(themeMode) === 'auto') applyTheme('auto', mq.matches); };
    mq.addEventListener('change', onSystemChange);

    // Auth
    try {
      const { user } = await getMe();
      currentUser.set(user);
    } catch {
      // Not logged in, which is fine for public routes
    } finally {
      authLoading = false;
    }

    return () => {
      unsubTheme();
      mq.removeEventListener('change', onSystemChange);
    };
  });
</script>

{#if authLoading}
  <AppSkeleton />
{:else if $currentPath.startsWith('/kiosk')}
  <Kiosk />
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
        <Dashboard />
      {:else if $currentPath === '/midterms'}
        <Midterms />
      {:else if $currentPath === '/login'}
        <Login />
      {:else if $currentPath === '/admin'}
        <Admin />
      {:else if $currentPath === '/calendar'}
        <Calendar />
      {:else if $currentPath === '/about'}
        <About />
      {:else if $currentPath === '/scheduler'}
        <Scheduler />
      {:else if $currentPath === '/poster'}
        <Poster />
      {:else if $currentPath === '/updates'}
        <Updates />
      {:else if dynamicRoute?.name === 'update-detail'}
        <UpdateDetail slug={dynamicRoute.params.slug} />
      {:else if dynamicRoute?.name === 'event-detail'}
        <EventDetail id={parseInt(dynamicRoute.params.id)} />
      {:else if $currentPath === '/terms'}
        <Terms />
      {:else if $currentPath === '/privacy'}
        <Privacy />
      {/if}
    </main>
    <Footer />
  </div>
{/if}
