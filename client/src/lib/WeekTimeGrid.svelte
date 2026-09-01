<script>
  import { createEventDispatcher } from 'svelte';
  import { campusFields, calendarDayKey, campusTodayMarker, fallsOnDay } from './campusTime.js';

  export let weekDays = [];
  export let events = [];
  export let midterms = [];
  /** A day marker for today on campus, so the highlighted column is the right one. */
  export let today = campusTodayMarker();
  export let rsoColorMap = {};
  export let loading = false;

  const dispatch = createEventDispatcher();

  const HOUR_START = 7;
  const HOUR_END = 22;
  const SLOT_H = 60; // px per hour
  const TOTAL_H = (HOUR_END - HOUR_START) * SLOT_H;
  const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START);

  /** Two columns stand for the same day. */
  function isSameDay(a, b) {
    const key = calendarDayKey(a);
    return key !== '' && key === calendarDayKey(b);
  }

  function fmtTime(dateStr) {
    const f = campusFields(dateStr);
    if (!f) return '';
    const ampm = f.hour >= 12 ? 'pm' : 'am';
    const h12 = f.hour % 12 || 12;
    return f.minute === 0 ? `${h12}${ampm}` : `${h12}:${String(f.minute).padStart(2, '0')}${ampm}`;
  }

  function fmtHour(h) {
    const ampm = h >= 12 ? 'pm' : 'am';
    return `${h % 12 || 12}${ampm}`;
  }

  function placeItem(startTime, endTime) {
    // A row on the grid is an hour on the campus clock, so an event is placed
    // by the hour it starts on campus rather than in the reader's own zone.
    const s = campusFields(startTime) ?? { hour: 0, minute: 0 };
    const e = campusFields(endTime) ?? s;
    const startFrac = s.hour + s.minute / 60;
    const endFrac = e.hour + e.minute / 60;
    const top = Math.max(0, Math.min((startFrac - HOUR_START) * SLOT_H, TOTAL_H - 20));
    const height = Math.max(22, Math.min((endFrac - startFrac) * SLOT_H, TOTAL_H - top));
    return { top, height };
  }

  // Reactive derivation, with an explicit dependency on events/midterms/weekDays
  // so Svelte re-runs this whenever filters change
  $: itemsByDay = weekDays.map(day => ({
    events: events.filter(ev => fallsOnDay(ev.start_time, day)),
    midterms: midterms.filter(m => fallsOnDay(m.start_time, day)),
  }));
</script>

<!-- No max-height or overflow-y-auto, so the parent determines height -->
<div class="border rounded-lg overflow-hidden bg-card">
  <!-- Sticky header -->
  <div class="grid grid-cols-[3rem_repeat(7,1fr)] border-b bg-muted sticky top-0 z-10">
    <div></div>
    {#each weekDays as day}
      <div class="py-2 flex flex-col items-center gap-0.5 border-l border-border/40">
        <span class="text-xs font-semibold uppercase tracking-wide
          {isSameDay(day, today) ? 'text-primary' : 'text-muted-foreground'}">
          {day.toLocaleDateString('en-US', { weekday: 'short' })}
        </span>
        <span class="text-sm font-medium
          {isSameDay(day, today) ? 'bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center' : 'text-muted-foreground'}">
          {day.getDate()}
        </span>
      </div>
    {/each}
  </div>

  <!-- Body: hour labels + day columns -->
  <div class="grid grid-cols-[3rem_repeat(7,1fr)]">

    <!-- Hour label column: absolute-positioned labels aligned to lines -->
    <div class="relative" style="height: {TOTAL_H}px;">
      {#each HOURS as h, i}
        {#if i > 0}
          <!-- Label floats just above the hour line it corresponds to -->
          <div
            class="absolute right-2 text-[10px] text-muted-foreground leading-none select-none"
            style="top: {i * SLOT_H - 7}px;"
          >
            {fmtHour(h)}
          </div>
        {/if}
      {/each}
    </div>

    <!-- Day columns -->
    {#each weekDays as day, di}
      {@const dayItems = itemsByDay[di] ?? { events: [], midterms: [] }}
      <div
        class="relative border-l border-border/40
          {isSameDay(day, today) ? 'bg-primary/5' : ''}"
        style="height: {TOTAL_H}px;"
      >
        <!-- Hour lines (skip the very first, which is covered by the header border) -->
        {#each HOURS as _, i}
          {#if i > 0}
            <div
              class="absolute left-0 right-0 border-t border-border/30"
              style="top: {i * SLOT_H}px;"
            ></div>
          {/if}
        {/each}

        <!-- Loading shimmer -->
        {#if loading}
          {#each [0.15, 0.4, 0.65] as frac}
            <div
              class="absolute left-1 right-1 h-8 rounded bg-muted animate-pulse"
              style="top: {frac * TOTAL_H}px;"
            ></div>
          {/each}
        {:else}
          <!-- Events -->
          {#each dayItems.events as event (event.event_id)}
            {@const { top, height } = placeItem(event.start_time, event.end_time)}
            {@const rsoColor = rsoColorMap[event.rso_name] ?? '#6b7280'}
            <div
              class="absolute left-0.5 right-0.5 rounded overflow-hidden cursor-pointer
                hover:brightness-110 transition-all z-10
                {event.is_private ? 'bg-orange-500 text-white' : 'bg-sky-500 text-white'}"
              style="top: {top}px; height: {height}px;"
              role="button"
              tabindex="0"
              title="{event.title} · {event.rso_name}"
              on:click={() => dispatch('eventclick', { event_id: event.event_id })}
              on:keydown={e => e.key === 'Enter' && dispatch('eventclick', { event_id: event.event_id })}
            >
              <div class="flex h-full overflow-hidden">
                <div class="w-1 flex-shrink-0" style="background-color: {rsoColor};"></div>
                <div class="flex-1 px-1 py-0.5 overflow-hidden">
                  <p class="text-xs font-medium leading-tight truncate">{event.title}</p>
                  {#if height >= 36}
                    <p class="text-[10px] leading-tight opacity-80">{fmtTime(event.start_time)}</p>
                  {/if}
                </div>
              </div>
            </div>
          {/each}

          <!-- Midterms -->
          {#each dayItems.midterms as midterm (midterm.midterm_id)}
            {@const { top, height } = placeItem(midterm.start_time, midterm.end_time)}
            <div
              class="absolute left-0.5 right-0.5 rounded overflow-hidden
                bg-violet-500 text-white z-10 flex items-center px-1.5 text-xs font-medium"
              style="top: {top}px; height: {height}px;"
              title="Midterm: {midterm.title} ({midterm.course_code})"
            >
              <span class="truncate">📝 {midterm.course_code}</span>
            </div>
          {/each}
        {/if}
      </div>
    {/each}
  </div>
</div>
