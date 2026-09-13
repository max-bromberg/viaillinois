<script>
  import { createEventDispatcher } from 'svelte';
  import { campusFields, calendarDayKey, campusTime, campusTodayMarker, fallsOnDay } from './campusTime.js';

  /**
   * The week view of the calendar.
   *
   * A column is a campus day and a row is a campus hour. It follows the same
   * rules as the month grid: an entry is the organization's adapted mark colour
   * as a 2 px trace on the left of its text, a midterm is plum, the day numbers
   * are condensed with today's in signal, and there is no legend, because the
   * filter rail's pads and names are the legend. See docs/design/08-surfaces.md.
   */
  export let weekDays = [];
  export let events = [];
  export let midterms = [];
  /** A day marker for today on campus, so the highlighted column is the right one. */
  export let today = campusTodayMarker();
  /**
   * The adapted mark colour for each organization, by name. An organization's
   * colour is never drawn as it was stored, so what arrives here has already
   * been through organizationColor. See docs/design/04-color.md.
   */
  export let marks = {};
  export let loading = false;

  const dispatch = createEventDispatcher();

  const HOUR_START = 7;
  const HOUR_END = 22;
  const SLOT_H = 60; // px per hour
  const TOTAL_H = (HOUR_END - HOUR_START) * SLOT_H;
  const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START);

  /** Every control has a target a hand can hit, entries on the grid included. */
  const MIN_ENTRY_H = 32;
  /** Under this an entry has room for its title and nothing else. */
  const SHOWS_TIME_H = 44;

  /** Two columns stand for the same day. */
  function isSameDay(a, b) {
    const key = calendarDayKey(a);
    return key !== '' && key === calendarDayKey(b);
  }

  /**
   * An hour on the campus clock, written the way the site writes times. The
   * rows of the grid are hours rather than instants, so there is nothing for
   * campusTime to convert; what it does convert, an event's start time, goes
   * through campusTime below.
   */
  function hourLabel(hour) {
    return `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`;
  }

  /**
   * A day marker is a local midnight standing for a campus day, so it is read
   * in the reader's own zone rather than converted again.
   */
  const dayName = marker => marker.toLocaleDateString('en-US', { weekday: 'short' });

  function placeItem(startTime, endTime) {
    // A row on the grid is an hour on the campus clock, so an event is placed
    // by the hour it starts on campus rather than in the reader's own zone.
    const s = campusFields(startTime) ?? { hour: 0, minute: 0 };
    const e = campusFields(endTime) ?? s;
    const startFrac = s.hour + s.minute / 60;
    const endFrac = e.hour + e.minute / 60;
    const top = Math.max(0, Math.min((startFrac - HOUR_START) * SLOT_H, TOTAL_H - MIN_ENTRY_H));
    const height = Math.max(MIN_ENTRY_H, Math.min((endFrac - startFrac) * SLOT_H, TOTAL_H - top));
    return { top, height };
  }

  const markOf = name => marks[name] ?? 'var(--line-strong)';

  function open(eventId) {
    dispatch('eventclick', { event_id: eventId });
  }

  // Reactive derivation, with an explicit dependency on events/midterms/weekDays
  // so Svelte re-runs this whenever filters change
  $: itemsByDay = weekDays.map(day => ({
    events: events.filter(ev => fallsOnDay(ev.start_time, day)),
    midterms: midterms.filter(m => fallsOnDay(m.start_time, day)),
  }));
</script>

<!-- No height of its own, so the page decides how tall the week is. -->
<div class="week">
  <div class="head">
    <div class="gutter"></div>
    {#each weekDays as day}
      <div class="dayhead" class:today={isSameDay(day, today)}>
        <span class="dayname">{dayName(day)}</span>
        <span class="daynum" class:today={isSameDay(day, today)}>{day.getDate()}</span>
      </div>
    {/each}
  </div>

  <div class="body">
    <!-- The hours, set beside the line each one names. -->
    <div class="gutter hours" style="height: {TOTAL_H}px">
      {#each HOURS as h, i}
        {#if i > 0}
          <span class="hour mono" style="top: {i * SLOT_H - 7}px">{hourLabel(h)}</span>
        {/if}
      {/each}
    </div>

    {#each weekDays as day, di}
      {@const dayItems = itemsByDay[di] ?? { events: [], midterms: [] }}
      <div class="col" data-day-column={di} style="height: {TOTAL_H}px">
        {#each HOURS as _, i}
          {#if i > 0}
            <div class="hourline" style="top: {i * SLOT_H}px"></div>
          {/if}
        {/each}

        {#if loading}
          <!-- The shape of what is coming, in well colour, with no shimmer. -->
          {#each [0.15, 0.4, 0.65] as frac}
            <span class="shape" style="top: {frac * TOTAL_H}px"></span>
          {/each}
        {:else}
          {#each dayItems.events as event (event.event_id)}
            {@const { top, height } = placeItem(event.start_time, event.end_time)}
            <button
              type="button"
              class="entry"
              style="--h: {markOf(event.rso_name)}; top: {top}px; height: {height}px"
              title="{event.title} · {event.rso_name}"
              on:click={() => open(event.event_id)}
            >
              <span class="text">{event.title}</span>
              {#if height >= SHOWS_TIME_H}
                <span class="when mono">{campusTime(event.start_time)}</span>
              {/if}
            </button>
          {/each}

          {#each dayItems.midterms as midterm (midterm.midterm_id)}
            {@const { top, height } = placeItem(midterm.start_time, midterm.end_time)}
            <div
              class="entry exam"
              style="--h: var(--plum); top: {top}px; height: {height}px"
              title="Midterm: {midterm.title} ({midterm.course_code})"
            >
              <span class="text">{midterm.course_code}</span>
            </div>
          {/each}
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  /*
   * The grid is hairlines on the card, with no rounded rectangle around it.
   * docs/design/06-shape-space-motion.md: a border is not how a surface is told
   * apart here.
   */
  .week {
    background: var(--card);
    border-top: 1px solid var(--line);
  }

  .head,
  .body {
    display: grid;
    grid-template-columns: 56px repeat(7, minmax(0, 1fr));
  }

  .head {
    border-bottom: 1px solid var(--line);
    background: var(--well);
  }

  .dayhead {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 0;
    border-left: 1px solid var(--line);
  }

  .dayname {
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 700;
    font-size: 12.5px;
    color: var(--muted);
  }

  .dayhead.today .dayname {
    color: var(--signal-text);
  }

  /* docs/design/08-surfaces.md: day numbers are condensed 700 at 16 px. */
  .daynum {
    font-family: var(--display);
    font-stretch: 75%;
    font-variation-settings: "opsz" 96;
    font-weight: 700;
    font-size: 16px;
    line-height: 1;
    color: var(--ink);
  }

  .daynum.today {
    color: var(--signal-text);
  }

  .gutter {
    position: relative;
  }

  .hour {
    position: absolute;
    right: 8px;
    font-size: 12px;
    line-height: 1;
    color: var(--muted);
  }

  .col {
    position: relative;
    border-left: 1px solid var(--line);
  }

  .hourline {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px solid var(--line);
  }

  /*
   * The one place a vertical colour line remains, because a calendar cell is
   * too small for a lamp. See docs/design/08-surfaces.md.
   */
  .entry {
    position: absolute;
    left: 2px;
    right: 2px;
    display: block;
    overflow: hidden;
    text-align: left;
    font: inherit;
    background: var(--card);
    border: 0;
    border-left: 2px solid var(--h);
    padding: 4px 6px;
    cursor: pointer;
    transition: background 200ms ease;
  }

  .entry:hover,
  .entry:focus-visible {
    background: color-mix(in srgb, var(--h) 14%, var(--card));
  }

  .entry:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .entry.exam {
    cursor: default;
  }

  .entry .text {
    display: block;
    font-family: var(--display);
    font-stretch: 90%;
    font-weight: 700;
    font-size: 12.5px;
    line-height: 1.2;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .entry .when {
    display: block;
    font-size: 12px;
    line-height: 1.3;
    color: var(--muted);
  }

  .shape {
    position: absolute;
    left: 2px;
    right: 2px;
    height: 32px;
    background: var(--well);
  }
</style>
