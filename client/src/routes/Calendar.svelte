<script>
  import { getEvents } from '../api/events.js';

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS   = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

  const today = new Date();
  let year  = today.getFullYear();
  let month = today.getMonth(); // 0-indexed

  let events  = [];
  let loading = false;
  let error   = null;

  $: monthLabel    = `${MONTHS[month]} ${year}`;
  $: firstWeekday  = new Date(year, month, 1).getDay();
  $: daysInMonth   = new Date(year, month + 1, 0).getDate();
  $: todayDay      = (month === today.getMonth() && year === today.getFullYear()) ? today.getDate() : -1;
  $: cells         = buildCells(year, month, firstWeekday, daysInMonth, events);

  function buildCells(y, m, startWeekday, totalDays, allEvents) {
    const byDay = {};
    for (const ev of allEvents) {
      const d = new Date(ev.start_time);
      if (d.getFullYear() === y && d.getMonth() === m) {
        const day = d.getDate();
        (byDay[day] ??= []).push(ev);
      }
    }
    const result = [];
    for (let i = 0; i < startWeekday; i++) result.push(null);
    for (let d = 1; d <= totalDays; d++) result.push({ day: d, events: byDay[d] ?? [] });
    return result;
  }

  async function fetchMonth(y, m) {
    loading = true;
    error   = null;
    try {
      const dm        = new Date(y, m + 1, 0).getDate();
      const startDate = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const endDate   = `${y}-${String(m + 1).padStart(2, '0')}-${String(dm).padStart(2, '0')}`;
      const { events: evs } = await getEvents({ startDate, endDate, limit: 300 });
      events = evs;
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  $: fetchMonth(year, month);

  function prevMonth() { if (month === 0) { month = 11; year--; } else month--; }
  function nextMonth() { if (month === 11) { month = 0; year++; } else month++; }
  function goToday()   { year = today.getFullYear(); month = today.getMonth(); }
</script>

<svelte:head>
  <title>Calendar – VIA</title>
  <meta name="description" content="Monthly calendar view of ECE RSO events at UIUC. Board and admin members see internal events for scheduling." />
</svelte:head>

<div class="space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold">Calendar</h1>
    <div class="flex items-center gap-2">
      <button
        on:click={goToday}
        class="px-3 py-1.5 text-xs border rounded-md hover:bg-accent transition-colors text-muted-foreground"
      >Today</button>
      <button
        on:click={prevMonth}
        class="px-2.5 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors"
        aria-label="Previous month"
      >‹</button>
      <span class="text-sm font-medium w-40 text-center">{monthLabel}</span>
      <button
        on:click={nextMonth}
        class="px-2.5 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors"
        aria-label="Next month"
      >›</button>
    </div>
  </div>

  {#if error}
    <p class="text-sm text-destructive">{error}</p>
  {:else}
    <div class="border rounded-lg overflow-hidden bg-card">
      <!-- Weekday header row -->
      <div class="grid grid-cols-7 bg-muted border-b">
        {#each WEEKDAYS as day}
          <div class="py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {day}
          </div>
        {/each}
      </div>

      <!-- Day cells -->
      <div class="grid grid-cols-7 border-l border-t">
        {#each cells as cell}
          {#if cell === null}
            <!-- Empty leading cell -->
            <div class="border-r border-b bg-muted/20 min-h-[7rem]"></div>
          {:else}
            <div class="border-r border-b min-h-[7rem] p-1.5 space-y-1">
              <!-- Day number -->
              <div class="flex justify-end">
                <span class="text-xs font-medium leading-none
                  {cell.day === todayDay
                    ? 'bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center'
                    : 'text-muted-foreground'}">
                  {cell.day}
                </span>
              </div>

              <!-- Event pills -->
              {#if loading}
                {#each Array(2) as _}
                  <div class="h-4 rounded bg-muted animate-pulse"></div>
                {/each}
              {:else}
                {#each cell.events.slice(0, 3) as ev (ev.event_id)}
                  <div
                    title="{ev.title} · {ev.rso_name}{ev.is_private ? ' (internal)' : ''}"
                    class="text-xs px-1.5 py-0.5 rounded truncate leading-tight
                      {ev.is_private
                        ? 'bg-amber-500/80 text-white'
                        : 'bg-primary/80 text-primary-foreground'}"
                  >
                    {ev.title}
                  </div>
                {/each}
                {#if cell.events.length > 3}
                  <p class="text-xs text-muted-foreground pl-1">+{cell.events.length - 3} more</p>
                {/if}
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    </div>

    <!-- Legend (only shown when private events are visible) -->
    {#if events.some(e => e.is_private)}
      <div class="flex items-center gap-4 text-xs text-muted-foreground pt-1">
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded bg-primary/80 inline-block"></span> Public
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded bg-amber-500/80 inline-block"></span> Internal (board/admin only)
        </div>
      </div>
    {/if}
  {/if}
</div>
