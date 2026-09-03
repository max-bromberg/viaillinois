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
  let filters = { keyword: '', tags: [], startDate: '', endDate: '', timeframe: 'upcoming' };
  let selectedRsoIds = [];
  let showInternal = true;
  let page = 1;
  let rsos = [];

  // One page of events, as the server built it. Every filter the panel offers
  // is applied by the query, so this is already the page the reader asked for.
  let rawEvents = [];
  let serverTotal = 0; // every filter is applied by the server, so this counts them all

  $: archived = filters.timeframe === 'archived';
  $: heading = archived ? 'Archived Events' : 'Upcoming Events';

  $: rsoColorByName = Object.fromEntries(rsos.map(r => [r.name, r.logo_color || null]));
  $: rsoIdByName = Object.fromEntries(rsos.map(r => [r.name, r.rso_id]));

  // Both filter panel controls are answered by the server, so one page of
  // results is one query. They used to be applied here, which meant the feed
  // asked for every matching event in the term before it could draw eighteen of
  // them, and the count under the pager was worked out from whatever subset had
  // arrived.
  $: displayedEvents = rawEvents;
  $: totalPages = Math.max(1, Math.ceil(serverTotal / PAGE_SIZE));

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
    // Read directly from the variables rather than from a reactive statement,
    // since fetchEvents is called synchronously after they are assigned.
    try {
      const { events, total: t } = await getEvents({
        ...filters,
        rsoIds: selectedRsoIds,
        excludePrivate: !showInternal,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      rawEvents = events;
      serverTotal = t ?? 0;
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
    fetchEvents();
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
  <meta name="description" content="Browse and filter upcoming ECE RSO events at UIUC, from every student organization in the department, in one feed." />
</svelte:head>

<div class="flex flex-col gap-4 md:flex-row md:gap-6">
  <div class="flex flex-col gap-4 w-full md:w-56 md:shrink-0">
    <TagFilter {rsos} on:change={handleFiltersChange} />
    <UpdatesWidget />
  </div>

  <div class="flex-1 space-y-4">
    <h1 class="text-2xl font-bold">{heading}</h1>

    {#if archived}
      <p class="text-sm text-muted-foreground">These events have already happened. Switch back to upcoming to see what is on next.</p>
    {/if}

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
      <p class="text-muted-foreground text-sm">
        {archived ? 'No archived events found. Try adjusting your filters.' : 'No events found. Try adjusting your filters.'}
      </p>
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
