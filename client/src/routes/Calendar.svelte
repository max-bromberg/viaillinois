<script>
  import { onMount } from 'svelte';
  import { getEvents } from '../api/events.js';
  import { getConfirmedMidterms } from '../api/midterms.js';
  import { getRsos } from '../api/rsos.js';
  import { navigate } from '../lib/router.js';
  import CalendarFilter from '../lib/CalendarFilter.svelte';
  import UpdatesWidget from '../lib/UpdatesWidget.svelte';
  import WeekTimeGrid from '../lib/WeekTimeGrid.svelte';
  import { Button } from '../lib/components/ui/index.js';
  import { organizationColor } from '../lib/organizationColor.js';
  import { resolvedTheme } from '../stores/theme.js';
  import { campusFields, calendarDayKey, campusTodayMarker } from '../lib/campusTime.js';

  /**
   * The calendar.
   *
   * The month grid keeps its structure and takes the tokens. Day numbers are
   * condensed 700 at 16 px and today's number is signal. An entry is the
   * organization's adapted mark colour as a 2 px trace on the left of its text,
   * which is the one place a vertical colour line remains, because a calendar
   * cell is too small for a lamp. Midterms use plum. There is no legend of
   * coloured squares, because the filter rail's pads and names are the legend.
   * See docs/design/08-surfaces.md.
   */

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];

  // Today on campus. A reader in another zone still opens the calendar on the
  // day Champaign is having, which is the day the events on it belong to.
  const today = campusTodayMarker();

  // ── View/nav state ────────────────────────────────────────────────────────
  // The month is the view a board reads the calendar in: the question it is
  // opened with is what else is on this month, not what else is on this week.
  let view = 'month'; // 'week' | 'month'
  let year = today.getFullYear();
  let month = today.getMonth();
  let weekStart = getWeekStart(today);

  // ── Filter state ──────────────────────────────────────────────────────────
  let keyword = '';
  let selectedTags = [];
  let selectedRsoIds = [];
  let showMidterms = true;
  let showInternal = true;

  /**
   * The day whose cell is showing everything it holds.
   *
   * A cell has room for three entries, and a term imported from a calendar file
   * puts far more than three on some days. The rest used to sit behind a count
   * with nothing to click, so the honest reading of the grid was that the
   * events were not there.
   */
  let expandedDay = null;

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

  /**
   * A day marker is a local midnight standing for a campus day, so it is read
   * in the reader's own zone rather than converted a second time.
   */
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
  // A range is written with the word rather than with a dash, which is what
  // docs/design/10-voice.md asks of every range on the site.
  $: periodLabel = view === 'week'
    ? (weekStart.getMonth() === weekEnd.getMonth()
        ? `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} to ${weekEnd.getDate()}, ${weekStart.getFullYear()}`
        : `${fmt(weekStart, { month: 'short', day: 'numeric' })} to ${fmt(weekEnd, { month: 'short', day: 'numeric', year: 'numeric' })}`)
    : `${MONTHS[month]} ${year}`;

  $: period = view === 'week' ? 'week' : 'month';

  // ── The organizations' marks ──────────────────────────────────────────────
  // An organization's colour is stored exactly as its board gave it and is
  // never drawn that way. See docs/design/04-color.md.
  $: marks = Object.fromEntries(
    rsos.map(rso => [rso.name, organizationColor(rso.logo_color, 'mark', $resolvedTheme)]),
  );

  const markOf = (name, table) => table[name] ?? 'var(--line-strong)';

  // ── Month grid ────────────────────────────────────────────────────────────
  $: firstWeekday = new Date(year, month, 1).getDay();
  $: daysInMonth = new Date(year, month + 1, 0).getDate();

  function buildMonthCells(y, m, startWd, total, evs, mids) {
    // A month cell is a campus day, so each entry lands in the cell for the day
    // it happens on in Champaign rather than the day it falls on for the reader.
    const byDay = {};
    const place = (row, type) => {
      const f = campusFields(row.start_time);
      if (!f || f.year !== y || f.month !== m + 1) return;
      (byDay[f.day] ??= []).push({ ...row, _type: type });
    };
    for (const ev of evs) place(ev, 'event');
    for (const mt of mids) place(mt, 'midterm');

    const result = [];
    for (let i = 0; i < startWd; i++) result.push(null);
    for (let d = 1; d <= total; d++) {
      const items = (byDay[d] ?? []).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
      result.push({ day: d, items });
    }
    // The grid is drawn in weeks, so the week the month ends in is a whole row
    // rather than a short one with empty space beside it. A row that stopped
    // partway through read as a week the calendar had nothing for.
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }

  /** How many entries a cell draws before the rest are behind an opener. */
  const VISIBLE_PER_DAY = 3;

  $: monthCells = buildMonthCells(year, month, firstWeekday, daysInMonth, filteredEvents, filteredMidterms);
  // A day opened in one month is not a day in the next one.
  $: view, year, month, (expandedDay = null);

  $: showingThisMonth = month === today.getMonth() && year === today.getFullYear();

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
        // The week markers name calendar days. Sending them through toISOString
        // converted them to UTC, which asked for the wrong week west of it.
        startDate = calendarDayKey(ws);
        endDate = calendarDayKey(we);
      } else {
        const dm = new Date(y, m + 1, 0).getDate();
        startDate = `${y}-${String(m + 1).padStart(2, '0')}-01`;
        endDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(dm).padStart(2, '0')}`;
      }

      // A calendar can be paged back into the term that has already happened,
      // so it asks for the whole calendar. The date range it sends is what
      // decides which events it draws, not how far the feed reaches.
      const evRes = await getEvents({ startDate, endDate, keyword: kw || null, tags, timeframe: 'all', limit: 300 });
      allEvents = evRes.events || [];

      // Fetch confirmed midterms globally (not date-filtered, small dataset)
      try {
        const { midterms: mids } = await getConfirmedMidterms();
        allMidterms = mids || [];
      } catch {
        allMidterms = []; // stub not yet implemented, so degrade silently
      }
    } catch (err) {
      error = err?.message || 'The calendar did not load. Try again in a moment.';
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
  <title>Calendar: VIA</title>
  <meta name="description" content="Week and month calendar view of ECE RSO events at UIUC." />
</svelte:head>

<div class="page">
  <div class="rail">
    <CalendarFilter
      {keyword}
      {selectedTags}
      {rsos}
      {selectedRsoIds}
      {showMidterms}
      {showInternal}
      on:change={handleFilterChange}
    />
    <UpdatesWidget />
  </div>

  <div class="main">
    <div class="head">
      <div>
        <h1>Calendar</h1>
        <p class="period">{periodLabel}</p>
      </div>

      <div class="controls">
        <!--
          Two words with the one in view underlined by the Current gradient,
          which is how the site draws a choice between two readings of the same
          listing. See docs/design/08-surfaces.md.
        -->
        <div class="when">
          <button
            type="button"
            class:on={view === 'week'}
            aria-pressed={view === 'week'}
            on:click={() => view = 'week'}
          >Week</button>
          <button
            type="button"
            class:on={view === 'month'}
            aria-pressed={view === 'month'}
            on:click={() => view = 'month'}
          >Month</button>
        </div>

        <div class="nav">
          <Button variant="quiet" size="sm" onclick={prev}>Previous {period}</Button>
          <Button variant="quiet" size="sm" onclick={next}>Next {period}</Button>
          <Button variant="quiet" size="sm" onclick={goToday}>Today</Button>
        </div>
      </div>
    </div>

    {#if error}<p class="failed">{error}</p>{/if}

    {#if view === 'week'}
      <WeekTimeGrid
        {weekDays}
        events={filteredEvents}
        midterms={filteredMidterms}
        {today}
        {marks}
        {loading}
        on:eventclick={e => navigate('/events/' + e.detail.event_id)}
      />
    {:else}
      <div class="month">
        <div class="weekdays">
          {#each WEEKDAYS as day}
            <span>{day}</span>
          {/each}
        </div>

        <div class="cells">
          {#each monthCells as cell}
            {#if cell === null}
              <div data-month-cell class="cell empty"></div>
            {:else}
              {@const isToday = showingThisMonth && cell.day === today.getDate()}
              <div data-month-cell class="cell">
                <span class="daynum" class:today={isToday}>{cell.day}</span>

                {#if loading}
                  <!-- The shape of what is coming, in well colour, with no shimmer. -->
                  {#each Array(2) as _, row (row)}
                    <span class="shape"></span>
                  {/each}
                {:else}
                  {#each (expandedDay === cell.day ? cell.items : cell.items.slice(0, VISIBLE_PER_DAY)) as item (item._type + (item.event_id ?? item.midterm_id))}
                    {#if item._type === 'event'}
                      <button
                        type="button"
                        class="entry"
                        style="--h: {markOf(item.rso_name, marks)}"
                        title="{item.title} · {item.rso_name}"
                        on:click={() => navigate('/events/' + item.event_id)}
                      ><span class="text">{item.title}</span></button>
                    {:else}
                      <div
                        class="entry exam"
                        style="--h: var(--plum)"
                        title="Midterm: {item.title} ({item.course_code})"
                      ><span class="text">{item.course_code}</span></div>
                    {/if}
                  {/each}

                  {#if cell.items.length > VISIBLE_PER_DAY}
                    <button
                      type="button"
                      class="more"
                      on:click={() => expandedDay = expandedDay === cell.day ? null : cell.day}
                    >
                      {expandedDay === cell.day ? 'Show fewer' : `+${cell.items.length - VISIBLE_PER_DAY} more`}
                    </button>
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

<style>
  /*
   * A 200 pixel rail of words at the left and the calendar at the right, 36
   * pixels apart, which is the measure the feed uses. The page's own gutters
   * come from the shell.
   */
  .page {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 36px;
    align-items: start;
  }

  .rail {
    display: grid;
    gap: 26px;
    align-content: start;
  }

  .main {
    min-width: 0;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 18px;
  }

  h1 {
    font-family: var(--display);
    font-stretch: 75%;
    font-variation-settings: "opsz" 96;
    font-weight: 800;
    font-size: 40px;
    line-height: 0.95;
    letter-spacing: 0.006em;
    margin: 0;
  }

  .period {
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 700;
    font-size: 16px;
    color: var(--muted);
    margin: 8px 0 0;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 26px;
  }

  .when {
    display: inline-flex;
    gap: 14px;
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 700;
    font-size: 15px;
  }

  .when button {
    font: inherit;
    background: none;
    border: 0;
    padding: 0;
    min-height: 32px;
    color: var(--muted);
    cursor: pointer;
    position: relative;
  }

  .when button.on {
    color: var(--ink);
  }

  .when button.on::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 3px;
    height: 3px;
    background: var(--g-current);
    border-radius: 2px;
  }

  .when button:focus-visible,
  .more:focus-visible,
  .entry:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .nav {
    display: inline-flex;
    align-items: center;
    gap: 18px;
  }

  /* An error is a sentence under the thing that failed, never a red box. */
  .failed {
    color: var(--danger);
    font-size: 14px;
    margin: 0 0 12px;
  }

  /*
   * The grid is hairlines on the card, with no rounded rectangle around it and
   * no fill on the days that belong to the months either side.
   */
  .month {
    background: var(--card);
    border-top: 1px solid var(--line);
  }

  .weekdays,
  .cells {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .weekdays {
    background: var(--well);
    border-bottom: 1px solid var(--line);
  }

  .weekdays span {
    padding: 8px 0;
    text-align: center;
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 700;
    font-size: 12.5px;
    color: var(--muted);
  }

  .cell {
    min-height: 148px;
    padding: 6px 6px 8px;
    border-left: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  /*
   * The rules are between the days rather than around the grid, so the month is
   * a ruled block and not a box drawn around a calendar.
   */
  .cell:nth-child(7n + 1) {
    border-left: 0;
  }

  .cell.empty {
    background: var(--well);
  }

  /* docs/design/08-surfaces.md: day numbers are condensed 700 at 16 px. */
  .daynum {
    align-self: flex-end;
    font-family: var(--display);
    font-stretch: 75%;
    font-variation-settings: "opsz" 96;
    font-weight: 700;
    font-size: 16px;
    line-height: 1;
    color: var(--ink);
    margin-bottom: 4px;
  }

  .daynum.today {
    color: var(--signal-text);
  }

  /*
   * The one place a vertical colour line remains, because a calendar cell is
   * too small for a lamp. See docs/design/08-surfaces.md.
   */
  .entry {
    font: inherit;
    text-align: left;
    background: none;
    border: 0;
    border-left: 2px solid var(--h);
    padding: 6px 6px 6px 8px;
    min-height: 32px;
    display: flex;
    align-items: center;
    min-width: 0;
    cursor: pointer;
    transition: background 200ms ease;
  }

  .entry:hover,
  .entry:focus-visible {
    background: color-mix(in srgb, var(--h) 14%, var(--card));
  }

  .entry.exam {
    cursor: default;
  }

  .entry .text {
    font-family: var(--display);
    font-stretch: 90%;
    font-weight: 700;
    font-size: 13px;
    line-height: 1.2;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .more {
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    background: none;
    border: 0;
    padding: 0 0 0 10px;
    min-height: 32px;
    color: var(--primary);
    cursor: pointer;
  }

  .shape {
    height: 32px;
    background: var(--well);
  }

  @media (max-width: 768px) {
    .page {
      grid-template-columns: 1fr;
      gap: 20px;
    }

    .cell {
      min-height: 96px;
    }
  }
</style>
