<script>
  import { onMount } from 'svelte';
  import { getEvents } from '../api/events.js';
  import { getRsos } from '../api/rsos.js';
  import FilterRail from '../lib/FilterRail.svelte';
  import Pagination from '../lib/Pagination.svelte';
  import UpdatesWidget from '../lib/UpdatesWidget.svelte';
  import EventCardSkeleton from '../lib/EventCardSkeleton.svelte';
  import { DayGroup, EventRow, EmptyState, Button } from '../lib/components/ui/index.js';
  import { groupByDay } from '../lib/agenda.js';
  import { adminRsoIds, currentUser, isGlobalAdmin } from '../stores/auth.js';
  import { resolvedTheme } from '../stores/theme.js';
  import { navigate } from '../lib/router.js';
  import { toInstant } from '../lib/campusTime.js';

  /**
   * The feed, which is an agenda.
   *
   * Events read top to bottom, grouped by day, with the time set as the largest
   * thing in each row, so a week can be scanned without reading a single title.
   * Where the feed used to be a grid of identical bordered cards, learning when
   * anything was happening meant reading every card, which is the opposite of an
   * agenda.
   *
   * See docs/design/08-surfaces.md.
   */
  const PAGE_SIZE = 18;

  let loading = $state(false);
  let error = $state(null);
  let filters = $state({ keyword: '', tags: [], startDate: '', endDate: '', timeframe: 'upcoming' });
  let selectedRsoIds = $state([]);
  let showInternal = $state(true);
  let page = $state(1);
  let rsos = $state([]);
  let events = $state([]);
  let serverTotal = $state(0);
  let now = $state(new Date());

  /**
   * The timeframe keeps the name the API gives it, and the Discord companion
   * reads the same name. What a reader is shown is past, because that is what
   * happened to those events.
   */
  const past = $derived(filters.timeframe === 'archived');
  const heading = $derived(past ? 'Past' : 'Upcoming');
  const theme = $derived($resolvedTheme);

  const rsoByName = $derived(Object.fromEntries(rsos.map(rso => [rso.name, rso])));
  const days = $derived(groupByDay(events));
  const totalPages = $derived(Math.max(1, Math.ceil(serverTotal / PAGE_SIZE)));

  /** Whether the reader may be shown where an internal event is. */
  function canSeeRoom(event) {
    if (!event.is_private) return true;
    if ($isGlobalAdmin) return true;
    const rsoId = rsoByName[event.rso_name]?.rso_id ?? null;
    return $currentUser?.memberships?.some(membership => membership.rso_id === rsoId) ?? false;
  }

  /** Whether an event is running right now, which is what the signal colour is for. */
  function isLive(event) {
    const start = toInstant(event.start_time);
    const end = toInstant(event.end_time);
    if (!start) return false;
    const at = now.getTime();
    return start.getTime() <= at && (end ? at < end.getTime() : false);
  }

  function readPageFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const asked = parseInt(params.get('page'));
    return Number.isFinite(asked) && asked >= 1 ? asked : 1;
  }

  function pushPage(which) {
    const params = new URLSearchParams(window.location.search);
    if (which === 1) params.delete('page');
    else params.set('page', String(which));
    const query = params.toString();
    history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  }

  async function fetchEvents() {
    loading = true;
    error = null;
    try {
      const { events: page_, total } = await getEvents({
        ...filters,
        rsoIds: selectedRsoIds,
        excludePrivate: !showInternal,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      events = page_ ?? [];
      serverTotal = total ?? 0;
    } catch (failure) {
      error = failure.message;
      events = [];
    } finally {
      loading = false;
    }
  }

  function onFilters(change) {
    const { selectedRsoIds: chosen, showInternal: internal, ...rest } = change;
    filters = rest;
    selectedRsoIds = chosen;
    showInternal = internal;
    page = 1;
    pushPage(1);
    fetchEvents();
  }

  function onPage(event) {
    page = event.detail;
    pushPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    fetchEvents();
  }

  onMount(async () => {
    page = readPageFromUrl();
    fetchEvents();
    // The agenda says what is on right now, so it has to know what right now is
    // for longer than the moment the page was drawn.
    const tick = setInterval(() => { now = new Date(); }, 60000);
    try {
      const { rsos: list } = await getRsos();
      rsos = list ?? [];
    } catch {
      rsos = [];
    }
    return () => clearInterval(tick);
  });
</script>

<svelte:head>
  <title>Events: VIA</title>
  <meta name="description" content="Browse and filter upcoming ECE student organization events at Illinois, from every organization in the department, in one feed." />
</svelte:head>

<div class="page">
  <!--
    The rail and what is new sit in the same column. The updates were on the feed
    before the conversion and a reader who never opens About would otherwise have
    no way to them, so they stay.
  -->
  <div class="left">
    <FilterRail {rsos} onchange={onFilters} />
    <UpdatesWidget />
  </div>

  <div class="agenda">
    <div class="feedhead">
      <h1>{heading}</h1>
      <span>{serverTotal} {serverTotal === 1 ? 'event' : 'events'}</span>
    </div>

    <!--
      A board member reading the feed had no way from it to the place events are
      created, so the way in belongs beside the feed the gap shows up in.
    -->
    {#if $adminRsoIds.length > 0}
      <div class="lead">
        <Button variant="primary" icon="bolt" onclick={() => navigate('/scheduler')}>Schedule an event</Button>
      </div>
    {/if}

    {#if past}
      <p class="said">These events have already happened. Switch back to upcoming to see what is on next.</p>
    {/if}

    <Pagination currentPage={page} {totalPages} on:change={onPage} />

    {#if error}
      <p class="wrong">The feed did not load. Try again in a moment.</p>
    {:else if loading}
      <!-- The shape of the rows, in the well colour, with no shimmer. -->
      <div class="waiting">
        {#each Array(6) as _, at (at)}<EventCardSkeleton />{/each}
      </div>
    {:else if days.length === 0}
      <EmptyState
        lead={past ? 'Nothing back there.' : 'Nothing on.'}
        say={past
          ? 'No event in this range has happened yet. Switch back to upcoming to see what is on next.'
          : 'Nothing matches what you have asked for. If you expected more here, clear a tag or two.'}
      />
    {:else}
      {#each days as group (group.day)}
        <DayGroup day={group.events[0].start_time} {now}>
          {#each group.events as event (event.event_id)}
            <EventRow
              {event}
              {theme}
              live={isLive(event)}
              showRoom={canSeeRoom(event)}
              onnavigate={navigate}
            />
          {/each}
        </DayGroup>
      {/each}
    {/if}

    <Pagination currentPage={page} {totalPages} on:change={onPage} />
  </div>
</div>

<style>
  /*
   * The rail is a 200 px track. A grid item is free to grow past its track when
   * something inside it will not shrink, and the date pickers would not, so the
   * rail leaned across the agenda and the day names sat underneath it.
   */
  .left {
    display: grid;
    gap: 26px;
    align-content: start;
    min-width: 0;
  }

  /*
   * A grid item's automatic minimum size is its content, and that beats
   * max-width, so the rail has to be told outright that it may be narrower than
   * the longest tag in it. Without this it grew to 268 px inside its 200 px
   * track and leaned across the day names.
   */
  .left > :global(*) {
    min-width: 0;
    max-width: 100%;
  }

  .agenda {
    min-width: 0;
  }

  .lead {
    margin: 14px 0 4px;
  }

  .said {
    color: var(--muted);
    font-size: 13.5px;
    margin: 10px 0 0;
    max-width: 58ch;
  }

  /* An error is a sentence in danger text under the thing that failed. */
  .wrong {
    color: var(--danger);
    font-size: 14px;
    margin: 18px 0;
  }

  .waiting {
    display: grid;
    gap: 6px;
  }
</style>
