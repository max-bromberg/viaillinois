<script>
  import { onMount } from 'svelte';
  import { Router, Route, navigate } from 'svelte-routing';
  import { currentUser } from './stores/auth.js';
  import { getMe } from './api/users.js';
  import NavBar    from './lib/NavBar.svelte';
  import Home      from './routes/Home.svelte';
  import Dashboard from './routes/Dashboard.svelte';
  import Midterms  from './routes/Midterms.svelte';
  import Kiosk     from './routes/Kiosk.svelte';
  import Login     from './routes/Login.svelte';
  import Admin     from './routes/Admin.svelte';
  import AppSkeleton from './lib/AppSkeleton.svelte';
  import { toast } from './stores/ui.js';

  let authLoading = true;

  onMount(async () => {
    try {
      const { user } = await getMe();
      currentUser.set(user);
    } catch {
      // Not logged in — fine for public routes
    } finally {
      authLoading = false;
    }
  });
</script>

{#if authLoading}
  <AppSkeleton />
{:else}
  <Router>
    {#if $toast}
      <div class="fixed top-4 right-4 z-50 rounded-md px-4 py-2 text-sm font-medium shadow-md
        {$toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}">
        {$toast.message}
      </div>
    {/if}

    <Route path="/kiosk" component={Kiosk} />

    <div class="min-h-screen bg-background text-foreground">
      {#if !window.location.pathname.startsWith('/kiosk')}
        <NavBar />
      {/if}

      <main class="container mx-auto px-4 py-6">
        <Route path="/"           component={Home} />
        <Route path="/dashboard"  component={Dashboard} />
        <Route path="/midterms"   component={Midterms} />
        <Route path="/login"      component={Login} />
        <Route path="/admin"      component={Admin} />
      </main>
    </div>
  </Router>
{/if}
