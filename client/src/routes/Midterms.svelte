<script>
  import { onMount } from 'svelte';
  import { getMidterms, createMidterm, deleteMidterm, deleteMidterms } from '../api/midterms.js';
  import { searchLocations } from '../api/locations.js';
  import MidtermRow from '../lib/MidtermRow.svelte';
  import { locationLabel } from '../lib/locationLabel.js';
  import MidtermRowSkeleton from '../lib/MidtermRowSkeleton.svelte';
  import CalendarImport from '../lib/CalendarImport.svelte';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { showToast } from '../stores/ui.js';
  import { currentUser, isGlobalAdmin, isRsoAdmin } from '../stores/auth.js';

  let midterms = [];
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

  // Sort state, chronological by default
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

  // Form state
  let form = { course_code: '', title: '', start_time: '', end_time: '' };

  // Location autocomplete state
  let locationQuery = '';      // text the user typed
  let locationSuggestions = [];
  let selectedLocation = null; // { location_id, building, room_number }
  let locationDebounce;
  let showSuggestions = false;

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
      showToast('Please select a location from the suggestions', 'error');
      return;
    }
    loading = true;
    try {
      await createMidterm({ ...form, location_id: selectedLocation.location_id });
      showToast('Midterm submitted, thanks!');
      showForm = false;
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
    locationQuery = `${loc.building} · ${loc.room_number}`;
    locationSuggestions = [];
    showSuggestions = false;
  }

  function onLocationBlur() {
    // Delay so a suggestion click registers before the dropdown closes
    setTimeout(() => { showSuggestions = false; }, 150);
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

  onMount(load);
</script>

<svelte:head>
  <title>Midterms: VIA</title>
  <meta name="description" content="Community-sourced ECE midterm exam schedule at UIUC. Help RSO boards avoid scheduling conflicts during exam weeks." />
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between gap-2 flex-wrap">
    <h1 class="text-2xl font-bold">Midterm Schedule</h1>
    <div class="flex gap-2">
      <Input placeholder="Search exams…" bind:value={courseFilter} class="w-44 h-9" />
      {#if $currentUser}
        <Button size="sm" class="whitespace-nowrap" on:click={() => showForm = !showForm}>+ Submit</Button>
      {/if}
      {#if canManage}
        <Button size="sm" variant="outline" class="whitespace-nowrap" on:click={() => showImport = !showImport}>
          {showImport ? 'Close import' : 'Import calendar'}
        </Button>
      {/if}
    </div>
  </div>

  {#if canManage && chosenOnPage.length > 0}
    <div class="flex items-center justify-between gap-3 flex-wrap border rounded-lg px-4 py-2.5 bg-card">
      <p class="text-sm">
        {chosenOnPage.length} {chosenOnPage.length === 1 ? 'midterm' : 'midterms'} chosen.
      </p>
      <div class="flex items-center gap-2">
        {#if confirmingBulk}
          <span class="text-xs text-destructive font-medium">This cannot be undone.</span>
          <button
            class="px-2.5 py-1 text-xs bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors"
            on:click={handleBulkDelete}
          >Yes, delete {chosenOnPage.length}</button>
          <button
            class="px-2.5 py-1 text-xs border border-input rounded-md hover:bg-accent transition-colors"
            on:click={() => confirmingBulk = false}
          >Cancel</button>
        {:else}
          <button
            class="px-2.5 py-1 text-xs border border-destructive/50 text-destructive rounded-md hover:bg-destructive/10 transition-colors"
            on:click={() => confirmingBulk = true}
          >Delete {chosenOnPage.length} chosen</button>
          <button
            class="px-2.5 py-1 text-xs border border-input rounded-md hover:bg-accent transition-colors"
            on:click={() => { chosenIds = new Set(); confirmingBulk = false; }}
          >Clear</button>
        {/if}
      </div>
    </div>
  {/if}

  {#if showImport}
    <CalendarImport kind="midterms" on:imported={load} />
  {/if}

  {#if showForm}
    <form on:submit|preventDefault={handleSubmit} class="border rounded-lg p-4 bg-card grid grid-cols-2 gap-3">
      <input placeholder="Course code (e.g. ECE 313)" bind:value={form.course_code} required
        class="col-span-2 border rounded px-3 py-1.5 text-sm bg-background" />
      <input placeholder="Title (e.g. Midterm 1)" bind:value={form.title} required
        class="col-span-2 border rounded px-3 py-1.5 text-sm bg-background" />

      <!-- Location autocomplete -->
      <div class="col-span-2 relative">
        <input
          type="text"
          placeholder="Location (e.g. ECEB, Grainger…)"
          bind:value={locationQuery}
          on:input={onLocationInput}
          on:focus={() => { if (locationSuggestions.length) showSuggestions = true; }}
          on:blur={onLocationBlur}
          autocomplete="off"
          required
          class="w-full border rounded px-3 py-1.5 text-sm bg-background
            {selectedLocation ? 'border-primary ring-1 ring-primary' : ''}"
        />
        {#if selectedLocation}
          <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-primary font-medium pointer-events-none">✓</span>
        {/if}
        {#if showSuggestions}
          <ul class="absolute z-20 w-full mt-1 bg-card border rounded-md shadow-md overflow-hidden max-h-48 overflow-y-auto">
            {#each locationSuggestions as loc (loc.location_id)}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
              <li
                class="px-3 py-2 text-sm cursor-pointer hover:bg-accent flex items-center justify-between gap-4"
                on:mousedown|preventDefault={() => selectLocation(loc)}
              >
                <span><span class="font-medium">{loc.building}</span> · {loc.room_number}</span>
                <span class="text-xs text-muted-foreground shrink-0">cap. {loc.max_capacity}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <input type="datetime-local" bind:value={form.start_time} required
        class="border rounded px-3 py-1.5 text-sm bg-background" />
      <input type="datetime-local" bind:value={form.end_time} required
        class="border rounded px-3 py-1.5 text-sm bg-background" />
      <Button type="submit" disabled={loading} class="col-span-2">{loading ? 'Submitting…' : 'Submit midterm'}</Button>
    </form>
  {/if}

  <div class="border rounded-lg overflow-hidden bg-card">
    <table class="w-full text-left">
      <thead class="bg-muted">
        <tr>
          {#if canManage}
            <th class="py-2 pl-4 pr-0 w-8">
              <input
                type="checkbox"
                data-midterm-tick-all
                checked={allOnPageChosen}
                aria-label="Choose every midterm listed"
                on:change={chooseAllOnPage}
                class="rounded border-input text-primary focus:ring-primary"
              />
            </th>
          {/if}
          {#each [['exam','Exam'],['start_time','Time'],['location','Location'],['status','Status']] as [col, label]}
            <th
              class="py-2 px-4 text-xs font-semibold uppercase tracking-wide cursor-pointer select-none hover:bg-muted/70 transition-colors whitespace-nowrap"
              on:click={() => toggleSort(col)}
            >
              {label}
              {#if sortCol === col}
                <span class="ml-0.5 opacity-60">{sortDir === 'asc' ? '▲' : '▼'}</span>
              {/if}
            </th>
          {/each}
          {#if canManage}
            <th class="py-2 px-4 text-xs font-semibold uppercase tracking-wide text-right">
              <span class="sr-only">Actions</span>
            </th>
          {/if}
        </tr>
      </thead>
      <tbody>
        {#if loading}
          {#each Array(5) as _}
            <MidtermRowSkeleton canDelete={canManage} />
          {/each}
        {:else if sorted.length === 0}
          <tr><td colspan={canManage ? 6 : 4} class="py-8 text-center text-sm text-muted-foreground">
            {courseFilter ? 'No exams match your search.' : 'No midterms found.'}
          </td></tr>
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
      </tbody>
    </table>
  </div>
</div>
