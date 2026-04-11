<script>
  import { onMount, onDestroy } from 'svelte';
  import { getKioskEvents } from '../api/events.js';
  import KioskCard from '../lib/KioskCard.svelte';
  import KioskCardSkeleton from '../lib/KioskCardSkeleton.svelte';

  let events = [];
  let currentIndex = 0;
  let interval;
  let refreshInterval;
  let initialLoading = true;
  const ROTATE_MS  = 8000;  // 8 seconds per event
  const REFRESH_MS = 60000; // Re-fetch every minute

  async function fetchEvents() {
    try {
      const { events: e } = await getKioskEvents(20);
      events = e;
      if (currentIndex >= e.length) currentIndex = 0;
    } catch { /* keep showing current events if fetch fails */ }
  }

  onMount(async () => {
    await fetchEvents();
    initialLoading = false;
    interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % Math.max(events.length, 1);
    }, ROTATE_MS);
    refreshInterval = setInterval(fetchEvents, REFRESH_MS);
  });

  onDestroy(() => {
    clearInterval(interval);
    clearInterval(refreshInterval);
  });
</script>

<svelte:head>
  <style>body { overflow: hidden; }</style>
</svelte:head>

{#if initialLoading}
  <KioskCardSkeleton />
{:else if events.length === 0}
  <div class="min-h-screen flex items-center justify-center bg-background">
    <p class="text-4xl text-muted-foreground font-light">No upcoming events</p>
  </div>
{:else}
  {#key currentIndex}
    <div class="animate-in fade-in duration-700">
      <KioskCard event={events[currentIndex]} />
    </div>
  {/key}
  <!-- Dot indicators -->
  <div class="fixed bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
    {#each events as _, i}
      <div class="w-2 h-2 rounded-full transition-colors {i === currentIndex ? 'bg-foreground' : 'bg-muted-foreground/30'}"></div>
    {/each}
  </div>
{/if}
