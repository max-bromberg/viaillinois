<script>
  import { getEvents } from '../api/events.js';
  import { getConfirmedMidterms } from '../api/midterms.js';
  import { navigate } from '../lib/router.js';

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS   = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
  const ALL_TAGS = ['Free Food','Workshop','Social','Corporate','Competition','Weekly Meeting','Speaker','Networking'];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── View state ─────────────────────────────────────────────────────────────
  let view       = 'week'; // 'week' | 'month'
  let year       = today.getFullYear();
  let month      = today.getMonth();
  let weekStart  = getWeekStart(today);

  // ── Filter state ───────────────────────────────────────────────────────────
  let keyword     = '';
  let selectedTags = [];

  // ── Data ───────────────────────────────────────────────────────────────────
  let events    = [];
  let midterms  = [];
  let loading   = false;
  let error     = null;

  // ── Helpers ────────────────────────────────────────────────────────────────
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

  function toggleTag(tag) {
    selectedTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
  }

  function clearFilters() {
    keyword = '';
    selectedTags = [];
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  function goToday() {
    year  = today.getFullYear();
    month = today.getMonth();
    weekStart = getWeekStart(today);
  }

  function prev() {
    if (view === 'week') {
      const d = new Date(weekStart);
      d.setDate(d.getDate() - 7);
      weekStart = d;
      year  = d.getFullYear();
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
      year  = d.getFullYear();
      month = d.getMonth();
    } else {
      if (month === 11) { month = 0; year++; } else month++;
    }
  }

  // ── Derived labels ─────────────────────────────────────────────────────────
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

  // ── Month grid ─────────────────────────────────────────────────────────────
  $: firstWeekday = new Date(year, month, 1).getDay();
  $: daysInMonth  = new Date(year, month + 1, 0).getDate();
  $: monthCells   = buildMonthCells(year, month, firstWeekday, daysInMonth, events, midterms);

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

  // ── Week cells ─────────────────────────────────────────────────────────────
  $: weekCells = weekDays.map(day => {
    const items = [
      ...events.filter(ev => isSameDay(new Date(ev.start_time), day))
               .map(ev => ({ ...ev, _type: 'event' })),
      ...midterms.filter(mt => isSameDay(new Date(mt.start_time), day))
                 .map(mt => ({ ...mt, _type: 'midterm' })),
    ].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    return { date: day, items };
  });

  // ── Fetch ──────────────────────────────────────────────────────────────────
  async function fetchData(v, ws, y, m, kw, tags) {
    loading = true;
    error   = null;
    try {
      let startDate, endDate;
      if (v === 'week') {
        const we = new Date(ws);
        we.setDate(we.getDate() + 6);
        startDate = ws.toISOString().slice(0, 10);
        endDate   = we.toISOString().slice(0, 10);
      } else {
        const dm = new Date(y, m + 1, 0).getDate();
        startDate = `${y}-${String(m + 1).padStart(2,'0')}-01`;
        endDate   = `${y}-${String(m + 1).padStart(2,'0')}-${String(dm).padStart(2,'0')}`;
      }
      const [evRes] = await Promise.allSettled([
        getEvents({ startDate, endDate, keyword: kw || null, tags, limit: 300 }),
      ]);
      if (evRes.status === 'fulfilled') events = evRes.value.events;
      else error = evRes.reason.message;

      // Fetch confirmed midterms globally (not date-filtered, small dataset)
      try {
        const { midterms: mids } = await getConfirmedMidterms();
        midterms = mids;
      } catch {
        midterms = []; // stub not yet implemented — silently degrade
      }
    } finally {
      loading = false;
    }
  }

  $: fetchData(view, weekStart, year, month, keyword, selectedTags);
</script>

<svelte:head>
  <title>Calendar – VIA</title>
  <meta name="description" content="Week and month calendar view of ECE RSO events at UIUC." />
</svelte:head>

<div class="space-y-3">

  <!-- ── Top bar ─────────────────────────────────────────────────────────── -->
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h1 class="text-2xl font-bold">Calendar</h1>

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

      <button on:click={goToday}
        class="px-3 py-1.5 text-xs border rounded-md hover:bg-accent transition-colors text-muted-foreground">Today</button>
      <button on:click={prev}
        class="px-2.5 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors" aria-label="Previous">‹</button>
      <span class="text-sm font-medium w-52 text-center">{periodLabel}</span>
      <button on:click={next}
        class="px-2.5 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors" aria-label="Next">›</button>
    </div>
  </div>

  <!-- ── Filter bar ──────────────────────────────────────────────────────── -->
  <div class="flex flex-wrap items-center gap-2">
    <input
      type="text"
      placeholder="Filter events…"
      bind:value={keyword}
      class="h-8 text-sm border rounded px-2 bg-background w-40"
    />
    {#each ALL_TAGS as tag}
      <button
        class="text-xs border rounded-full px-2 py-0.5 transition-colors
          {selectedTags.includes(tag) ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent text-muted-foreground'}"
        on:click={() => toggleTag(tag)}
      >{tag}</button>
    {/each}
    {#if keyword || selectedTags.length}
      <button class="text-xs text-muted-foreground hover:text-foreground transition-colors px-1" on:click={clearFilters}>
        Clear
      </button>
    {/if}
  </div>

  {#if error}
    <p class="text-sm text-destructive">{error}</p>
  {/if}

  <!-- ── Calendar grid ───────────────────────────────────────────────────── -->
  <div class="border rounded-lg overflow-hidden bg-card">

    <!-- Weekday header -->
    {#if view === 'week'}
      <div class="grid grid-cols-7 bg-muted border-b">
        {#each weekDays as day, i}
          <div class="py-2 text-center text-xs font-semibold uppercase tracking-wide
            {isSameDay(day, today) ? 'text-primary' : 'text-muted-foreground'}">
            {WEEKDAYS[i]}<br/>
            <span class="font-normal normal-case">
              {day.getDate()}
            </span>
          </div>
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-7 bg-muted border-b">
        {#each WEEKDAYS as day}
          <div class="py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{day}</div>
        {/each}
      </div>
    {/if}

    <!-- Cells -->
    {#if view === 'week'}
      <div class="grid grid-cols-7 border-l border-t">
        {#each weekCells as cell}
          <div class="border-r border-b min-h-[9rem] p-1.5 space-y-1
            {isSameDay(cell.date, today) ? 'bg-primary/5' : ''}">
            {#if loading}
              {#each Array(2) as _}
                <div class="h-4 rounded bg-muted animate-pulse"></div>
              {/each}
            {:else}
              {#each cell.items.slice(0, 4) as item (item._type + (item.event_id ?? item.midterm_id))}
                {#if item._type === 'event'}
                  <button
                    class="w-full text-left text-xs px-1.5 py-0.5 rounded truncate leading-tight cursor-pointer
                      {item.is_private ? 'bg-amber-500/80 text-white' : 'bg-primary/80 text-primary-foreground'}
                      hover:opacity-80 transition-opacity"
                    title="{item.title} · {item.rso_name}"
                    on:click={() => navigate('/events/' + item.event_id)}
                  >{item.title}</button>
                {:else}
                  <div
                    class="text-xs px-1.5 py-0.5 rounded truncate leading-tight bg-teal-500/80 text-white"
                    title="Midterm: {item.title} ({item.course_code})"
                  >📝 {item.course_code}</div>
                {/if}
              {/each}
              {#if cell.items.length > 4}
                <p class="text-xs text-muted-foreground pl-1">+{cell.items.length - 4} more</p>
              {/if}
            {/if}
          </div>
        {/each}
      </div>

    {:else}
      <!-- Month view -->
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
                      class="w-full text-left text-xs px-1.5 py-0.5 rounded truncate leading-tight cursor-pointer
                        {item.is_private ? 'bg-amber-500/80 text-white' : 'bg-primary/80 text-primary-foreground'}
                        hover:opacity-80 transition-opacity"
                      title="{item.title} · {item.rso_name}"
                      on:click={() => navigate('/events/' + item.event_id)}
                    >{item.title}</button>
                  {:else}
                    <div
                      class="text-xs px-1.5 py-0.5 rounded truncate leading-tight bg-teal-500/80 text-white"
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
    {/if}

  </div>

  <!-- Legend -->
  <div class="flex items-center gap-4 text-xs text-muted-foreground pt-1">
    <div class="flex items-center gap-1.5">
      <span class="w-3 h-3 rounded bg-primary/80 inline-block"></span> Public event
    </div>
    {#if events.some(e => e.is_private)}
      <div class="flex items-center gap-1.5">
        <span class="w-3 h-3 rounded bg-amber-500/80 inline-block"></span> Internal event
      </div>
    {/if}
    {#if midterms.length}
      <div class="flex items-center gap-1.5">
        <span class="w-3 h-3 rounded bg-teal-500/80 inline-block"></span> Confirmed midterm
      </div>
    {/if}
  </div>

</div>
