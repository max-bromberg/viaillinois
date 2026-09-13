<script>
  import { onMount } from 'svelte';
  import { getMidterms, createMidterm, deleteMidterm, deleteMidterms } from '../api/midterms.js';
  import { searchLocations } from '../api/locations.js';
  import { getCurrentSemester } from '../api/semester.js';
  import MidtermRow from '../lib/MidtermRow.svelte';
  import MidtermRowSkeleton from '../lib/MidtermRowSkeleton.svelte';
  import CalendarImport from '../lib/CalendarImport.svelte';
  import { locationLabel } from '../lib/locationLabel.js';
  import { campusStartOfDay, campusToday } from '../lib/campusTime.js';
  import { Button, Field, Icon, Pad, TermRibbon, EmptyState } from '../lib/components/ui/index.js';
  import { showToast } from '../stores/ui.js';
  import { currentUser, isGlobalAdmin, isRsoAdmin } from '../stores/auth.js';

  /**
   * The midterm schedule.
   *
   * The term at the top as a ribbon of weeks, each one warmed by the number of
   * exams in it, and the exams under it as a listing. See
   * docs/design/08-surfaces.md, "Midterms".
   */

  let midterms = [];
  let semester = null;
  let loading = false;
  let courseFilter = '';
  let showForm = false;
  let showImport = false;

  // The schedule belongs to no single RSO, so anyone on a board may correct it,
  // as may a global admin. A board member cannot reach the admin page, so for
  // them this listing is the only place the controls can be.
  $: canManage = $isGlobalAdmin || $isRsoAdmin;

  /**
   * The entries ticked for removal together.
   *
   * A calendar imported under the wrong course codes leaves a page of entries
   * to take off the schedule, and taking them off one confirmation at a time is
   * what boards were doing. Held as a set of identifiers rather than as a flag
   * on each row, so that filtering and sorting the listing leaves the choice
   * where it was.
   */
  let chosenIds = new Set();
  let confirmingBulk = false;

  $: chosenOnPage = sorted.filter(m => chosenIds.has(m.midterm_id));
  $: allOnPageChosen = sorted.length > 0 && chosenOnPage.length === sorted.length;

  function chooseOne({ midterm_id, chosen }) {
    const next = new Set(chosenIds);
    if (chosen) next.add(midterm_id); else next.delete(midterm_id);
    chosenIds = next;
    if (next.size === 0) confirmingBulk = false;
  }

  function chooseAllOnPage() {
    const next = new Set(chosenIds);
    if (allOnPageChosen) {
      for (const m of sorted) next.delete(m.midterm_id);
    } else {
      for (const m of sorted) next.add(m.midterm_id);
    }
    chosenIds = next;
    if (next.size === 0) confirmingBulk = false;
  }

  async function handleBulkDelete() {
    const ids = chosenOnPage.map(m => m.midterm_id);
    if (ids.length === 0) return;
    confirmingBulk = false;
    try {
      const { deleted } = await deleteMidterms(ids);
      chosenIds = new Set();
      showToast(`${deleted} ${deleted === 1 ? 'midterm' : 'midterms'} deleted`);
      await load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // Sort state, chronological by default.
  const ORDERS = [['start_time', 'Time'], ['exam', 'Exam'], ['location', 'Room'], ['status', 'Status']];
  let sortCol = 'start_time';
  let sortDir = 'asc';

  function toggleSort(col) {
    if (sortCol === col) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortCol = col;
      sortDir = 'asc';
    }
  }

  // Fuzzy: case-insensitive substring match across exam fields
  $: filtered = courseFilter.trim()
    ? midterms.filter(m => {
        const q = courseFilter.toLowerCase();
        return (m.course_code  || '').toLowerCase().includes(q)
            || (m.course_title || '').toLowerCase().includes(q)
            || (m.title        || '').toLowerCase().includes(q);
      })
    : midterms;

  $: sorted = [...filtered].sort((a, b) => {
    let av, bv;
    if (sortCol === 'start_time') {
      av = new Date(a.start_time).getTime();
      bv = new Date(b.start_time).getTime();
    } else if (sortCol === 'location') {
      av = locationLabel(a).toLowerCase();
      bv = locationLabel(b).toLowerCase();
    } else if (sortCol === 'status') {
      av = a.status?.toLowerCase() ?? ''; bv = b.status?.toLowerCase() ?? '';
    } else { // exam
      av = `${a.course_code} ${a.title}`.toLowerCase();
      bv = `${b.course_code} ${b.title}`.toLowerCase();
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  // ── The term, as a ribbon of weeks ─────────────────────────────────────────

  /** A day as the number of milliseconds at its start in UTC, for counting. */
  const asNumber = day => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  const asDay = value => new Date(value).toISOString().slice(0, 10);
  const WEEK = 7 * 86400000;

  /** A term at Illinois runs about sixteen weeks, and no term runs forever. */
  const MOST_WEEKS = 24;

  /**
   * The weeks of the term with the number of exams in each.
   *
   * The weeks start where instruction starts rather than on a Monday, so the
   * ribbon's first cell is the first week of the term as the calendar of the
   * term counts it.
   */
  $: weeks = (() => {
    const from = campusStartOfDay(semester?.instruction_start);
    const to = campusStartOfDay(semester?.instruction_end);
    if (!from || !to) return [];
    const cells = [];
    for (let at = asNumber(from); at <= asNumber(to) && cells.length < MOST_WEEKS; at += WEEK) {
      const start = asDay(at);
      const count = midterms.filter(m => {
        const day = campusStartOfDay(m.start_time);
        return day !== '' && asNumber(day) >= at && asNumber(day) < at + WEEK;
      }).length;
      cells.push({ start, count });
    }
    return cells;
  })();

  $: thisWeek = (() => {
    const today = asNumber(campusToday());
    const here = weeks.find(week => {
      const at = asNumber(week.start);
      return today >= at && today < at + WEEK;
    });
    return here ? here.start : null;
  })();

  $: weeksToGo = thisWeek
    ? weeks.length - weeks.findIndex(week => week.start === thisWeek) - 1
    : null;

  $: confirmedCount = midterms.filter(m => m.status === 'Confirmed').length;

  $: ribbonNote = midterms.length === 0 ? null : [
    `${confirmedCount} of ${midterms.length} confirmed`,
    weeksToGo === null ? null : `${weeksToGo} ${weeksToGo === 1 ? 'week' : 'weeks'} to go`,
  ].filter(Boolean).join(' · ');

  $: termName = semester?.label ?? null;

  // ── The form ───────────────────────────────────────────────────────────────

  let form = { course_code: '', title: '', start_time: '', end_time: '' };

  // Location autocomplete state
  let locationQuery = '';      // text the user typed
  let locationSuggestions = [];
  let selectedLocation = null; // { location_id, building, room_number }
  let locationDebounce;
  let showSuggestions = false;
  let locationError = null;

  async function load() {
    loading = true;
    try {
      const { midterms: m } = await getMidterms(null);
      midterms = m;
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      loading = false;
    }
  }

  async function handleSubmit() {
    if (!selectedLocation) {
      locationError = 'Choose a location from the suggestions.';
      return;
    }
    loading = true;
    try {
      await createMidterm({ ...form, location_id: selectedLocation.location_id });
      showToast('Added to the midterm schedule.');
      closeForm();
      form = { course_code: '', title: '', start_time: '', end_time: '' };
      locationQuery = '';
      selectedLocation = null;
      locationSuggestions = [];
      await load();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      loading = false;
    }
  }

  function onLocationInput() {
    selectedLocation = null; // clear selection when user edits
    locationError = null;
    clearTimeout(locationDebounce);
    if (locationQuery.trim().length < 2) {
      locationSuggestions = [];
      showSuggestions = false;
      return;
    }
    locationDebounce = setTimeout(async () => {
      try {
        const { locations } = await searchLocations(locationQuery);
        locationSuggestions = locations;
        showSuggestions = locations.length > 0;
      } catch {
        locationSuggestions = [];
      }
    }, 250);
  }

  function selectLocation(loc) {
    selectedLocation = loc;
    locationQuery = `${loc.building} ${loc.room_number}`;
    locationSuggestions = [];
    showSuggestions = false;
    locationError = null;
  }

  function onLocationBlur() {
    // Delay so a suggestion click registers before the list closes
    setTimeout(() => { showSuggestions = false; }, 150);
  }

  function openForm() {
    showForm = true;
    locationError = null;
  }

  function closeForm() {
    showForm = false;
    showSuggestions = false;
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && showForm) closeForm();
  }

  /** The dialog takes the keyboard when it opens, or it has not really opened. */
  function opened(node) {
    node.querySelector('input, button')?.focus();
  }

  async function handleDelete(midtermId) {
    try {
      await deleteMidterm(midtermId);
      showToast('Midterm deleted');
      await load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  onMount(async () => {
    // The term is what the ribbon is drawn from. A term the platform cannot
    // name leaves the ribbon out and the listing where it is.
    try {
      ({ semester } = await getCurrentSemester());
    } catch {
      semester = null;
    }
    await load();
  });
</script>

<svelte:head>
  <title>Midterms: VIA</title>
  <meta name="description" content="The midterm schedule for Electrical and Computer Engineering at Illinois, kept by students. Organizations read it so that an event does not land on the night of an exam." />
</svelte:head>

<svelte:window on:keydown={onKeydown} />

<div class="mt">
  <div class="head">
    <div>
      <h1>{#if termName}Midterms,<br>{termName}{:else}Midterms{/if}</h1>
      <p>
        Kept by students and confirmed by course staff. If yours is missing, add it and the
        next person will thank you.
      </p>
    </div>
    <div class="row">
      <Field
        label="Search the schedule"
        labelHidden
        placeholder="Course code or title"
        bind:value={courseFilter}
        class="find"
      />
      {#if $currentUser}
        <Button variant={showForm ? 'secondary' : 'primary'} onclick={openForm}>Add a midterm</Button>
      {/if}
      {#if canManage}
        <Button variant="secondary" onclick={() => showImport = !showImport}>
          {showImport ? 'Close import' : 'Import calendar'}
        </Button>
      {/if}
    </div>
  </div>

  <TermRibbon {weeks} current={thisWeek} note={ribbonNote} />

  {#if showImport}
    <div class="importer">
      <CalendarImport kind="midterms" on:imported={load} />
    </div>
  {/if}

  {#if canManage && chosenOnPage.length > 0}
    <div class="chosen">
      <p>{chosenOnPage.length} {chosenOnPage.length === 1 ? 'midterm' : 'midterms'} chosen.</p>
      <div class="row">
        {#if confirmingBulk}
          <span class="warn">This cannot be undone.</span>
          <Button variant="danger" size="sm" onclick={handleBulkDelete}>
            Yes, delete {chosenOnPage.length}
          </Button>
          <Button variant="secondary" size="sm" onclick={() => confirmingBulk = false}>Cancel</Button>
        {:else}
          <Button variant="danger" size="sm" onclick={() => confirmingBulk = true}>
            Delete {chosenOnPage.length} chosen
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onclick={() => { chosenIds = new Set(); confirmingBulk = false; }}
          >Clear</Button>
        {/if}
      </div>
    </div>
  {/if}

  <div class="ordering">
    <div class="orders" role="group" aria-label="Order the schedule">
      {#each ORDERS as [col, label] (col)}
        <button
          type="button"
          class="order"
          class:on={sortCol === col}
          aria-pressed={sortCol === col}
          on:click={() => toggleSort(col)}
        >
          {label}
          {#if sortCol === col}
            <Icon
              name="arrow"
              class={sortDir === 'asc' ? 'up' : 'down'}
              label={sortDir === 'asc' ? 'first to last' : 'last to first'}
            />
          {/if}
        </button>
      {/each}
    </div>
    {#if canManage && sorted.length > 0}
      <label class="all">
        <span class="tick">
          <input
            type="checkbox"
            data-midterm-tick-all
            checked={allOnPageChosen}
            aria-label="Choose every midterm listed"
            on:change={chooseAllOnPage}
          />
          <Pad hollow={!allOnPageChosen} lit={allOnPageChosen} />
        </span>
        <span>Choose every midterm listed</span>
      </label>
    {/if}
  </div>

  <div class="exams">
    {#if loading}
      {#each Array(5) as _, at (at)}
        <MidtermRowSkeleton canDelete={canManage} />
      {/each}
    {:else if sorted.length === 0}
      {#if courseFilter}
        <EmptyState
          lead="Nothing matches that"
          say="Clear the search to see the whole term. If the exam you are looking for is missing, add it and the next person will thank you."
        />
      {:else}
        <EmptyState
          lead="Nothing on the schedule yet"
          say="The schedule is kept by students. Add the first exam you know about and the next person will thank you."
        />
      {/if}
    {:else}
      {#each sorted as midterm (midterm.midterm_id)}
        <MidtermRow
          {midterm}
          canDelete={canManage}
          chosen={chosenIds.has(midterm.midterm_id)}
          on:choose={e => chooseOne(e.detail)}
          on:delete={e => handleDelete(e.detail.midterm_id)}
        />
      {/each}
    {/if}
  </div>
</div>

{#if showForm}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="scrim" on:click={closeForm}></div>
  <div class="dialog cut" role="dialog" aria-modal="true" aria-label="Add a midterm" use:opened>
    <h2>Add a midterm</h2>
    <form on:submit|preventDefault={handleSubmit}>
      <Field label="Course code" placeholder="ECE 313" required bind:value={form.course_code} />
      <Field label="Exam" placeholder="Midterm 1" required bind:value={form.title} />

      <div class="where">
        <Field
          label="Location"
          placeholder="ECEB, Grainger, Loomis"
          required
          autocomplete="off"
          bind:value={locationQuery}
          oninput={onLocationInput}
          onfocus={() => { if (locationSuggestions.length) showSuggestions = true; }}
          onblur={onLocationBlur}
          error={locationError}
          help={selectedLocation ? `${selectedLocation.building} ${selectedLocation.room_number} chosen.` : 'Choose a location from the suggestions.'}
        />
        {#if showSuggestions}
          <ul class="suggestions cut">
            {#each locationSuggestions as loc (loc.location_id)}
              <li>
                <button
                  type="button"
                  on:mousedown|preventDefault={() => selectLocation(loc)}
                  on:click={() => selectLocation(loc)}
                >
                  <span><b>{loc.building}</b> {loc.room_number}</span>
                  <span class="cap">room for {loc.max_capacity}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="pair">
        <Field label="Starts" type="datetime-local" required bind:value={form.start_time} />
        <Field label="Ends" type="datetime-local" required bind:value={form.end_time} />
      </div>

      <div class="row">
        <Button variant="primary" type="submit" busy={loading} on="card">
          {loading ? 'Adding the midterm' : 'Add the midterm'}
        </Button>
        <Button variant="secondary" on="card" onclick={closeForm}>Cancel</Button>
      </div>
    </form>
  </div>
{/if}

<style>
  .head p {
    /* The sentence under the title, at the measure the reference render sets. */
    color: var(--muted);
    font-size: 14.5px;
    margin-top: 10px;
    max-width: 46ch;
  }

  .row {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .head .row {
    align-items: flex-end;
  }

  .head :global(.fld.find) {
    width: 240px;
  }

  .importer {
    margin-top: 24px;
  }

  /*
   * The count of what is chosen and what can be done with it, as a line rather
   * than as a box, because the listing under it is already a listing.
   */
  .chosen {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    margin-top: 22px;
    font-size: 14px;
  }

  .chosen .warn {
    color: var(--danger);
    font-size: 12.5px;
  }

  .ordering {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
    margin-top: 26px;
  }

  .orders {
    display: inline-flex;
    gap: 18px;
  }

  /*
   * The words the schedule can be ordered by, with the one in use underlined by
   * the Current gradient, as the feed's rail underlines the timeframe it is on.
   */
  .order {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 2px;
    border: 0;
    background: none;
    cursor: pointer;
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 700;
    font-size: 15px;
    color: var(--muted);
  }

  .order.on {
    color: var(--ink);
  }

  .order.on::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 3px;
    height: 3px;
    background: var(--g-current);
    border-radius: 2px;
  }

  .order:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  .order :global(svg.i.up) {
    transform: rotate(-90deg);
  }

  .order :global(svg.i.down) {
    transform: rotate(90deg);
  }

  .all {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--muted);
    cursor: pointer;
  }

  /*
   * The tick is a pad, and the checkbox under it is what the keyboard and the
   * screen reader answer. Left at zero size it would take no focus, so it keeps
   * the target's own size and its own transparency.
   */
  .all .tick {
    position: relative;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
  }

  .all .tick input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .all .tick:focus-within {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  /* The dialog the add form opens in, built from the same parts as the page. */
  .scrim {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--ink) 45%, transparent);
    z-index: 40;
  }

  .dialog {
    position: fixed;
    z-index: 41;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    padding: 26px 28px 28px;
    background: var(--card);
    box-shadow: var(--shadow-float);
    --cut: 18px;
  }

  .dialog h2 {
    font-family: var(--display);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 30px;
    line-height: 1;
    margin-bottom: 20px;
  }

  form {
    display: grid;
    gap: 18px;
  }

  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }

  .where {
    position: relative;
  }

  .suggestions {
    position: absolute;
    z-index: 2;
    left: 0;
    top: calc(100% - 18px);
    width: min(320px, 100%);
    max-height: 200px;
    overflow-y: auto;
    background: var(--card);
    box-shadow: var(--shadow-float);
    --cut: 10px;
    list-style: none;
  }

  .suggestions button {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    width: 100%;
    min-height: 32px;
    padding: 8px 12px;
    border: 0;
    background: none;
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    color: var(--ink);
    text-align: left;
  }

  .suggestions button:hover {
    background: var(--well);
  }

  .suggestions button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  .suggestions .cap {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
  }

  @media (max-width: 640px) {
    .pair {
      grid-template-columns: 1fr;
    }
  }
</style>
