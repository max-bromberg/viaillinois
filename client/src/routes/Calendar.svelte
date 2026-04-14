<script>
  import { onMount } from 'svelte';
  import { getEvents } from '../api/events.js';
  import { getConfirmedMidterms } from '../api/midterms.js';
  import { getRsos } from '../api/rsos.js';
  import { navigate } from '../lib/router.js';
  import CalendarFilter from '../lib/CalendarFilter.svelte';
  import WeekTimeGrid from '../lib/WeekTimeGrid.svelte';

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── View/nav state ────────────────────────────────────────────────────────
  let view = 'week'; // 'week' | 'month'
  let year = today.getFullYear();
  let month = today.getMonth();
  let weekStart = getWeekStart(today);

  // ── Filter state ──────────────────────────────────────────────────────────
  let keyword = '';
  let selectedTags = [];
  let selectedRsoIds = [];
  let showMidterms = true;
  let showInternal = true;

  // ── Data ──────────────────────────────────────────────────────────────────
  let allEvents = [];
  let allMidterms = [];
  let rsos = [];
  let loading = false;
  let error = null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getWeekStart(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function fmt(date, opts) {
    return date.toLocaleDateString('en-US', opts);
  }

  function goToday() {
    year = today.getFullYear();
    month = today.getMonth();
    weekStart = getWeekStart(today);
  }

  function prev() {
    if (view === 'week') {
      const d = new Date(weekStart);
      d.setDate(d.getDate() - 7);
      weekStart = d;
      year = d.getFullYear();
      month = d.getMonth();
    } else {
      if (month === 0) { month = 11; year--; } else month--;
    }
  }

  function next() {
    if (view === 'week') {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + 7);
      weekStart = d;
      year = d.getFullYear();
      month = d.getMonth();
    } else {
      if (month === 11) { month = 0; year++; } else month++;
    }
  }

  // ── Derived labels ────────────────────────────────────────────────────────
  $: weekEnd = (() => { const d = new Date(weekStart); d.setDate(d.getDate() + 6); return d; })();
  $: weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  $: periodLabel = view === 'week'
    ? (weekStart.getMonth() === weekEnd.getMonth()
        ? `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()}–${weekEnd.getDate()}, ${weekStart.getFullYear()}`
        : `${fmt(weekStart, { month: 'short', day: 'numeric' })} – ${fmt(weekEnd, { month: 'short', day: 'numeric', year: 'numeric' })}`)
    : `${MONTHS[month]} ${year}`;

  // ── RSO color map (reactive) ──────────────────────────────────────────────
  $: rsoColorMap = rsos.reduce((acc, rso) => {
    acc[rso.name] = rso.logo_color || '#6b7280';
    return acc;
  }, {});

  // ── Month grid ────────────────────────────────────────────────────────────
  $: firstWeekday = new Date(year, month, 1).getDay();
  $: daysInMonth = new Date(year, month + 1, 0).getDate();

  function buildMonthCells(y, m, startWd, total, evs, mids) {
    const byDay = {};
    for (const ev of evs) {
      const d = new Date(ev.start_time);
      if (d.getFullYear() === y && d.getMonth() === m) {
        const day = d.getDate();
        (byDay[day] ??= []).push({ ...ev, _type: 'event' });
      }
    }
    for (const mt of mids) {
      const d = new Date(mt.start_time);
      if (d.getFullYear() === y && d.getMonth() === m) {
        const day = d.getDate();
        (byDay[day] ??= []).push({ ...mt, _type: 'midterm' });
      }
    }
    const result = [];
    for (let i = 0; i < startWd; i++) result.push(null);
    for (let d = 1; d <= total; d++) {
      const items = (byDay[d] ?? []).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
      result.push({ day: d, items });
    }
    return result;
  }

  $: monthCells = buildMonthCells(year, month, firstWeekday, daysInMonth, filteredEvents, filteredMidterms);

  // ── Week cells (for consistency, computed from filtered data) ──────────────
  $: weekCells = weekDays.map(day => {
    const items = [
      ...filteredEvents.filter(ev => isSameDay(new Date(ev.start_time), day))
                       .map(ev => ({ ...ev, _type: 'event' })),
      ...filteredMidterms.filter(mt => isSameDay(new Date(mt.start_time), day))
                         .map(mt => ({ ...mt, _type: 'midterm' })),
    ].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    return { date: day, items };
  });

  // ── Filtered data (reactive derivations) ──────────────────────────────────
  $: filteredEvents = allEvents.filter(ev => {
    if (!showInternal && ev.is_private) return false;
    if (selectedRsoIds.length > 0) {
      const rso = rsos.find(r => r.name === ev.rso_name);
      if (!rso || !selectedRsoIds.includes(rso.rso_id)) return false;
    }
    return true;
  });

  $: filteredMidterms = showMidterms ? allMidterms : [];

  // ── Fetch data ────────────────────────────────────────────────────────────
  async function fetchData(v, ws, y, m, kw, tags) {
    loading = true;
    error = null;
    try {
      let startDate, endDate;
      if (v === 'week') {
        const we = new Date(ws);
        we.setDate(we.getDate() + 6);
        startDate = ws.toISOString().slice(0, 10);
        endDate = we.toISOString().slice(0, 10);
      } else {
        const dm = new Date(y, m + 1, 0).getDate();
        startDate = `${y}-${String(m + 1).padStart(2, '0')}-01`;
        endDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(dm).padStart(2, '0')}`;
      }

      const evRes = await getEvents({ startDate, endDate, keyword: kw || null, tags, limit: 300 });
      allEvents = evRes.events || [];

      // Fetch confirmed midterms globally (not date-filtered, small dataset)
      try {
        const { midterms: mids } = await getConfirmedMidterms();
        allMidterms = mids || [];
      } catch {
        allMidterms = []; // stub not yet implemented — silently degrade
      }
    } catch (err) {
      error = err?.message || 'Failed to load events';
      allEvents = [];
      allMidterms = [];
    } finally {
      loading = false;
    }
  }

  $: fetchData(view, weekStart, year, month, keyword, selectedTags);

  // ── Filter change handler ────────────────────────────────────────────────
  function handleFilterChange(e) {
    keyword = e.detail.keyword;
    selectedTags = e.detail.selectedTags;
    selectedRsoIds = e.detail.selectedRsoIds;
    showMidterms = e.detail.showMidterms;
    showInternal = e.detail.showInternal;
  }

  // ── On mount ──────────────────────────────────────────────────────────────
  onMount(async () => {
    try {
      const { rsos: rsoList } = await getRsos();
      rsos = rsoList || [];
    } catch (err) {
      console.error('Failed to load RSOs:', err);
      rsos = [];
    }
  });
</script>

<svelte:head>
  <title>Calendar – VIA</title>
  <meta name="description" content="Week and month calendar view of ECE RSO events at UIUC." />
</svelte:head>

<div class="flex flex-col gap-4 md:flex-row md:gap-6">
  <!-- Left sidebar filter -->
  <CalendarFilter
    {keyword}
    {selectedTags}
    {rsos}
    {selectedRsoIds}
    {showMidterms}
    {showInternal}
    on:change={handleFilterChange}
  />

  <!-- Main calendar area -->
  <div class="flex-1 space-y-3 min-w-0">
    <!-- Top bar: heading + legend + view toggle + navigation -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-5">
        <h1 class="text-2xl font-bold">Calendar</h1>
        <div class="flex items-center gap-4 text-xs flex-wrap">
          <span class="flex items-center gap-1.5 font-medium"><span class="w-3.5 h-3.5 rounded bg-sky-500 inline-block"></span> Public event</span>
          <span class="flex items-center gap-1.5 font-medium"><span class="w-3.5 h-3.5 rounded bg-orange-500 inline-block"></span> Internal event</span>
          <span class="flex items-center gap-1.5 font-medium"><span class="w-3.5 h-3.5 rounded bg-violet-500 inline-block"></span> Midterm</span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <!-- View toggle -->
        <div class="flex border rounded-md overflow-hidden text-xs">
          <button
            class="px-3 py-1.5 transition-colors {view === 'week' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}"
            on:click={() => view = 'week'}
          >Week</button>
          <button
            class="px-3 py-1.5 transition-colors border-l {view === 'month' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}"
            on:click={() => view = 'month'}
          >Month</button>
        </div>

        <!-- Today button -->
        <button on:click={goToday}
          class="px-3 py-1.5 text-xs border rounded-md hover:bg-accent transition-colors text-muted-foreground">Today</button>

        <!-- Navigation buttons -->
        <button on:click={prev}
          class="px-2.5 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors" aria-label="Previous">‹</button>
        <span class="text-sm font-medium text-center min-w-[6rem]">{periodLabel}</span>
        <button on:click={next}
          class="px-2.5 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors" aria-label="Next">›</button>
      </div>
    </div>

    {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

    <!-- Calendar grid -->
    {#if view === 'week'}
      <WeekTimeGrid
        {weekDays}
        events={filteredEvents}
        midterms={filteredMidterms}
        {today}
        {rsoColorMap}
        {loading}
        on:eventclick={e => navigate('/events/' + e.detail.event_id)}
      />
    {:else}
      <!-- Month view -->
      <div class="border rounded-lg overflow-hidden bg-card">
        <!-- Weekday header -->
        <div class="grid grid-cols-7 bg-muted border-b">
          {#each WEEKDAYS as day}
            <div class="py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{day}</div>
          {/each}
        </div>

        <!-- Cells -->
        <div class="grid grid-cols-7 border-l border-t">
          {#each monthCells as cell}
            {#if cell === null}
              <div class="border-r border-b bg-muted/20 min-h-[7rem]"></div>
            {:else}
              {@const isToday = cell.day === today.getDate() && month === today.getMonth() && year === today.getFullYear()}
              <div class="border-r border-b min-h-[7rem] p-1.5 space-y-1">
                <div class="flex justify-end">
                  <span class="text-xs font-medium leading-none
                    {isToday ? 'bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center' : 'text-muted-foreground'}">
                    {cell.day}
                  </span>
                </div>
                {#if loading}
                  {#each Array(2) as _}
                    <div class="h-4 rounded bg-muted animate-pulse"></div>
                  {/each}
                {:else}
                  {#each cell.items.slice(0, 3) as item (item._type + (item.event_id ?? item.midterm_id))}
                    {#if item._type === 'event'}
                      <button
                        class="w-full text-left text-xs rounded overflow-hidden flex cursor-pointer hover:opacity-80 transition-opacity"
                        title="{item.title} · {item.rso_name}"
                        on:click={() => navigate('/events/' + item.event_id)}
                      >
                        <span class="w-1 flex-shrink-0" style="background-color: {rsoColorMap[item.rso_name] ?? '#6b7280'}"></span>
                        <span class="flex-1 px-1 py-0.5 truncate {item.is_private ? 'bg-orange-500 text-white' : 'bg-sky-500 text-white'}">{item.title}</span>
                      </button>
                    {:else}
                      <div
                        class="text-xs px-1.5 py-0.5 rounded truncate leading-tight bg-violet-500 text-white"
                        title="Midterm: {item.title} ({item.course_code})"
                      >📝 {item.course_code}</div>
                    {/if}
                  {/each}
                  {#if cell.items.length > 3}
                    <p class="text-xs text-muted-foreground pl-1">+{cell.items.length - 3} more</p>
                  {/if}
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

  </div>
</div>
