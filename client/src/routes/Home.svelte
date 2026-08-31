<script>
  import { onMount } from 'svelte';
  import { getEvents } from '../api/events.js';
  import { getRsos } from '../api/rsos.js';
  import EventCard from '../lib/EventCard.svelte';
  import TagFilter from '../lib/TagFilter.svelte';
  import EventCardSkeleton from '../lib/EventCardSkeleton.svelte';
  import Pagination from '../lib/Pagination.svelte';
  import UpdatesWidget from '../lib/UpdatesWidget.svelte';

  const PAGE_SIZE = 18;

  let loading = false;
  let error = null;
  let filters = { keyword: '', tags: [], startDate: '', endDate: '' };
  let selectedRsoIds = [];
  let showInternal = true;
  let page = 1;
  let rsos = [];

  // All events returned by the server for the current server-filter combination.
  // When client filters are active we fetch the full set; otherwise just one page.
  let rawEvents = [];
  let serverTotal = 0; // only meaningful when no client filters active

  $: hasClientFilters = selectedRsoIds.length > 0 || !showInternal;
  $: rsoColorByName = Object.fromEntries(rsos.map(r => [r.name, r.logo_color || null]));
  $: rsoIdByName = Object.fromEntries(rsos.map(r => [r.name, r.rso_id]));

  $: filteredEvents = rawEvents.filter(ev => {
    if (!showInternal && ev.is_private) return false;
    if (selectedRsoIds.length > 0) {
      const rso = rsos.find(r => r.name === ev.rso_name);
      if (!rso || !selectedRsoIds.includes(rso.rso_id)) return false;
    }
    return true;
  });

  // When client filters are active, paginate filteredEvents locally.
  // Otherwise the server already returned the correct page.
  $: totalPages = hasClientFilters
    ? Math.ceil(filteredEvents.length / PAGE_SIZE)
    : Math.ceil(serverTotal / PAGE_SIZE);

  $: displayedEvents = hasClientFilters
    ? filteredEvents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : filteredEvents;

  function readPageFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const n = parseInt(params.get('page'));
    return Number.isFinite(n) && n >= 1 ? n : 1;
  }

  function pushPage(p) {
    const params = new URLSearchParams(window.location.search);
    if (p === 1) {
      params.delete('page');
    } else {
      params.set('page', String(p));
    }
    const qs = params.toString();
    history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }

  async function fetchEvents() {
    loading = true;
    error = null;
    // Read directly from variables, since $: hasClientFilters may not have re-evaluated yet
    // when fetchEvents is called synchronously after assigning selectedRsoIds/showInternal.
    const clientFiltered = selectedRsoIds.length > 0 || !showInternal;
    try {
      if (clientFiltered) {
        // Fetch all server-matching events so client-side pagination is accurate.
        const { events } = await getEvents({ ...filters, limit: 10000, offset: 0 });
        rawEvents = events;
        serverTotal = 0;
      } else {
        const { events, total: t } = await getEvents({
          ...filters,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        });
        rawEvents = events;
        serverTotal = t ?? 0;
      }
    } catch (e) {
      error = e.message;
      rawEvents = [];
    } finally {
      loading = false;
    }
  }

  function handleFiltersChange(e) {
    const { selectedRsoIds: rsoIds, showInternal: si, ...rest } = e.detail;
    filters = rest;
    selectedRsoIds = rsoIds;
    showInternal = si;
    page = 1;
    pushPage(1);
    fetchEvents();
  }

  function handlePageChange(e) {
    page = e.detail;
    pushPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!(selectedRsoIds.length > 0 || !showInternal)) fetchEvents(); // client-filtered pages need no re-fetch
  }

  onMount(async () => {
    page = readPageFromUrl();
    fetchEvents();
    try {
      const { rsos: rsoList } = await getRsos();
      rsos = rsoList || [];
    } catch {
      rsos = [];
    }
  });
</script>

<svelte:head>
  <title>Events: VIA</title>
  <meta name="description" content="Browse and filter upcoming ECE RSO events at UIUC. RSVP to events from your favourite student organizations." />
</svelte:head>

<div class="flex flex-col gap-4 md:flex-row md:gap-6">
  <div class="flex flex-col gap-4 w-full md:w-56 md:shrink-0">
    <TagFilter {rsos} on:change={handleFiltersChange} />
    <UpdatesWidget />
  </div>

  <div class="flex-1 space-y-4">
    <h1 class="text-2xl font-bold">Upcoming Events</h1>

    <Pagination currentPage={page} {totalPages} on:change={handlePageChange} />

    {#if error}
      <p class="text-sm text-destructive">{error}</p>
    {:else if loading}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each Array(PAGE_SIZE) as _}
          <EventCardSkeleton />
        {/each}
      </div>
    {:else if displayedEvents.length === 0}
      <p class="text-muted-foreground text-sm">No events found. Try adjusting your filters.</p>
    {:else}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each displayedEvents as event (event.event_id)}
          <EventCard {event} rsoColor={rsoColorByName[event.rso_name] ?? null} rsoId={rsoIdByName[event.rso_name] ?? null} />
        {/each}
      </div>
    {/if}

    <Pagination currentPage={page} {totalPages} on:change={handlePageChange} />
  </div>
</div>
