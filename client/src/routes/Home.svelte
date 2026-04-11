<script>
  import { eventList } from '../stores/events.js';
  import { getEvents } from '../api/events.js';
  import EventCard from '../lib/EventCard.svelte';
  import TagFilter from '../lib/TagFilter.svelte';
  import EventCardSkeleton from '../lib/EventCardSkeleton.svelte';

  let loading = false;
  let error = null;
  let filters = { keyword: '', tags: [], startDate: '', endDate: '' };

  async function fetchEvents() {
    loading = true;
    error = null;
    try {
      const { events } = await getEvents(filters);
      eventList.set(events);
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  $: filters, fetchEvents();
</script>

<div class="flex gap-6">
  <TagFilter on:change={e => { filters = e.detail; }} />

  <div class="flex-1 space-y-4">
    <h1 class="text-2xl font-bold">Upcoming Events</h1>

    {#if error}
      <p class="text-sm text-destructive">{error}</p>
    {:else if loading}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each Array(6) as _}
          <EventCardSkeleton />
        {/each}
      </div>
    {:else if $eventList.length === 0}
      <p class="text-muted-foreground text-sm">No events found. Try adjusting your filters.</p>
    {:else}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each $eventList as event (event.event_id)}
          <EventCard {event} />
        {/each}
      </div>
    {/if}
  </div>
</div>
