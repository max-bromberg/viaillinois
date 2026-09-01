<script>
  import { onMount } from 'svelte';
  import { campusDateTime, campusTime } from '../lib/campusTime.js';
  import { currentUser, adminRsoIds } from '../stores/auth.js';
  import { navigate } from '../lib/router.js';
  import { recommend } from '../api/scheduler.js';
  import { getCourses } from '../api/midterms.js';
  import { createEvent } from '../api/events.js';
  import { showToast } from '../stores/ui.js';
  import EventForm from '../lib/EventForm.svelte';
  import DayTierPicker from '../lib/DayTierPicker.svelte';
  import SchedulerInsightCard from '../lib/SchedulerInsightCard.svelte';
  import DatePicker from '../lib/DatePicker.svelte';
  import { searchLocations } from '../api/locations.js';

  $: if ($currentUser !== null && ($adminRsoIds || []).length === 0) navigate('/');

  $: schedulableRsos = ($currentUser?.memberships ?? []).filter(m => ['Board', 'Editor'].includes(m.role));
  let selectedRso = null;
  $: if (schedulableRsos.length === 1 && !selectedRso) selectedRso = schedulableRsos[0];

  // ── UI mode ──────────────────────────────────────────────────────────────
  let inputMode = 'wizard';     // 'wizard' | 'advanced'
  let wizardStep = 1;           // 1-5
  let outputTab = 'curated';    // 'curated' | 'all'

  // ── Constraints ──────────────────────────────────────────────────────────
  let durationMinutes = 60;
  let startDate = '';
  let endDate = '';

  // Time constraint
  let timeStartHour = 16;
  let timeEndHour = 21;
  let timeTier = 'strongly_preferred';
  let enableTimeConstraint = true;

  // Day constraints
  let dayConstraints = []; // [{ day, tier }]

  // Venue constraints
  let buildingConstraints = []; // [{ building, tier }]
  let specificRoomId = null;
  let specificRoomTier = 'strongly_preferred';
  let excludedRooms = []; // [{ location_id, building, room_number }]
  let roomSearchQuery = '';
  let roomSearchResults = [];
  let roomSearchTimer = null;

  // Academic signals
  let targetCourses = [];
  let midtermSensitivity = 'medium';

  // ── Data ─────────────────────────────────────────────────────────────────
  let coursesList = [];
  let recommendations = null; // { curatedPicks, allOptions }
  let searching = false;
  let loading = false;
  let selectedRec = null;
  let showEventForm = false;

  const BUILDINGS = ['ECEB', 'CSL', 'CIF', 'Siebel'];
  const TIERS = ['required', 'strongly_preferred', 'nice_to_have'];
  const TIER_LABELS = { required: 'Required', strongly_preferred: 'Strongly Preferred', nice_to_have: 'Nice to Have' };
  const SENSITIVITY_LABELS = { low: 'Low (±1.5 days)', medium: 'Medium (±3 days)', high: 'High (±5 days)' };

  onMount(async () => {
    try {
      const data = await getCourses();
      if (data?.courses) coursesList = data.courses;
    } catch (e) { console.error('Failed to load courses:', e); }
  });

  // ── Derived constraint objects ────────────────────────────────────────────
  $: timeConstraintObj = enableTimeConstraint
    ? { startHour: parseInt(timeStartHour), endHour: parseInt(timeEndHour), tier: timeTier }
    : null;

  $: venueConstraintsObj = {
    buildings: buildingConstraints,
    specificRoom: specificRoomId ? { location_id: specificRoomId, tier: specificRoomTier } : null,
  };

  // ── Search ───────────────────────────────────────────────────────────────
  async function handleSearch() {
    if (!startDate || !endDate) { showToast('Start and end date required', 'error'); return; }
    if (new Date(startDate) >= new Date(endDate)) { showToast('Start date must be before end date', 'error'); return; }

    searching = true;
    recommendations = null;
    try {
      recommendations = await recommend({
        durationMinutes: parseInt(durationMinutes),
        dateRange: { start: startDate, end: endDate },
        timeConstraint: timeConstraintObj,
        dayConstraints,
        venueConstraints: venueConstraintsObj,
        excludedRooms,
        targetCourses,
        midtermSensitivity,
      });
      if (!recommendations.curatedPicks.length && !recommendations.allOptions.length) {
        showToast('No slots found for those constraints. Try relaxing the Required constraints.', 'error');
      }
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      searching = false;
    }
  }

  function handleSelect(e) {
    selectedRec = e.detail;
    showEventForm = true;
  }

  async function handleCreateEvent(e) {
    loading = true;
    try {
      await createEvent(e.detail);
      showToast('Event scheduled successfully!');
      navigate('/dashboard');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  }

  function toggleCourse(code) {
    targetCourses = targetCourses.includes(code)
      ? targetCourses.filter(c => c !== code)
      : [...targetCourses, code];
  }

  function toggleBuilding(b) {
    const exists = buildingConstraints.find(x => x.building === b);
    if (exists) {
      buildingConstraints = buildingConstraints.filter(x => x.building !== b);
    } else {
      buildingConstraints = [...buildingConstraints, { building: b, tier: 'strongly_preferred' }];
    }
  }

  function setBuildingTier(b, tier) {
    buildingConstraints = buildingConstraints.map(x => x.building === b ? { ...x, tier } : x);
  }

  function onRoomSearchInput(e) {
    clearTimeout(roomSearchTimer);
    const q = e.target.value;
    roomSearchQuery = q;
    if (q.length < 2) { roomSearchResults = []; return; }
    roomSearchTimer = setTimeout(async () => {
      try {
        const data = await searchLocations(q);
        roomSearchResults = (data?.locations ?? []).filter(
          r => !excludedRooms.some(x => x.location_id === r.location_id)
        );
      } catch { roomSearchResults = []; }
    }, 250);
  }

  function addExcludedRoom(room) {
    if (!excludedRooms.some(r => r.location_id === room.location_id)) {
      excludedRooms = [...excludedRooms, { location_id: room.location_id, building: room.building, room_number: room.room_number }];
    }
    roomSearchQuery = '';
    roomSearchResults = [];
  }

  function removeExcludedRoom(locationId) {
    excludedRooms = excludedRooms.filter(r => r.location_id !== locationId);
  }

  function fmtTime(iso) {
    return campusTime(iso);
  }
  function fmtDateTime(iso) {
    return campusDateTime(iso, { separator: ' · ' });
  }
</script>

<svelte:head><title>Intelligent Scheduler: VIA</title></svelte:head>

<div class="max-w-5xl mx-auto space-y-6 pb-20">

  <!-- Header -->
  <div class="space-y-1">
    <h1 class="text-2xl font-bold flex items-center gap-2">
      <svg class="text-primary" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      Intelligent Scheduler
    </h1>
    <p class="text-sm text-muted-foreground">
      We balance room availability, competing events, course schedules, and exam pressure to find your best window.
    </p>
  </div>

  {#if showEventForm && selectedRec}
    <!-- ── Event Form ─────────────────────────────────────────────────── -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">Finalize Event</h2>
        <button class="text-sm text-muted-foreground hover:text-foreground" on:click={() => showEventForm = false}>← Back</button>
      </div>
      <div class="bg-card border rounded-lg p-6">
        <div class="grid grid-cols-2 gap-4 mb-6 p-4 bg-muted/30 rounded-md border text-sm">
          <div>
            <p class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Time</p>
            <p class="font-medium">{fmtDateTime(selectedRec.start)} to {fmtTime(selectedRec.end)}</p>
          </div>
          <div>
            <p class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Venue</p>
            <p class="font-medium">{selectedRec.location?.building} {selectedRec.location?.room_number} · Cap {selectedRec.location?.max_capacity}</p>
          </div>
        </div>
        <EventForm
          rsoId={selectedRso?.rso_id}
          initial={{
            start_time: selectedRec.start, end_time: selectedRec.end,
            location_id: selectedRec.location?.location_id,
            building: selectedRec.location?.building,
            room_number: selectedRec.location?.room_number,
          }}
          {loading}
          on:submit={handleCreateEvent}
          on:cancel={() => showEventForm = false}
        />
      </div>
    </div>

  {:else}
    <!-- ── RSO selector ──────────────────────────────────────────────── -->
    {#if schedulableRsos.length > 1}
      <div class="flex flex-wrap gap-2">
        {#each schedulableRsos as rso}
          <button
            class="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border transition-colors
              {selectedRso?.rso_id === rso.rso_id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}"
            on:click={() => { selectedRso = rso; recommendations = null; }}
          >
            {#if rso.logo_color}<span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background-color:{rso.logo_color}"></span>{/if}
            {rso.name}
          </button>
        {/each}
      </div>
    {/if}

    {#if selectedRso}
      <!-- ── Mode toggle ─────────────────────────────────────────────── -->
      <div class="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
        <button class="px-4 py-1.5 text-sm rounded-md transition-all {inputMode === 'wizard' ? 'bg-background shadow font-medium' : 'text-muted-foreground hover:text-foreground'}"
          on:click={() => inputMode = 'wizard'}>Wizard</button>
        <button class="px-4 py-1.5 text-sm rounded-md transition-all {inputMode === 'advanced' ? 'bg-background shadow font-medium' : 'text-muted-foreground hover:text-foreground'}"
          on:click={() => inputMode = 'advanced'}>Advanced</button>
      </div>

      {#if inputMode === 'wizard'}
        <!-- ═══════════════════════════════════════════════════════════ -->
        <!-- WIZARD MODE                                                  -->
        <!-- ═══════════════════════════════════════════════════════════ -->

        <!-- Progress bar -->
        <div class="flex gap-1.5 items-center">
          {#each [1,2,3,4,5] as s}
            <div class="h-1.5 flex-1 rounded-full {s <= wizardStep ? 'bg-primary' : 'bg-muted'}"></div>
          {/each}
          <span class="text-xs text-muted-foreground ml-2">Step {wizardStep} of 5</span>
        </div>

        <div class="border rounded-xl bg-card p-6 space-y-6 min-h-[320px]">

          {#if wizardStep === 1}
            <h2 class="text-lg font-semibold">Basics</h2>
            <div class="space-y-4 max-w-sm">
              <div class="space-y-1.5">
                <label class="text-sm font-medium" for="w-duration">Event Duration</label>
                <select id="w-duration" bind:value={durationMinutes} class="w-full border rounded-md px-3 py-2 text-sm bg-background">
                  <option value={30}>30 min</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                  <option value={180}>3 hours</option>
                </select>
              </div>
            </div>

          {:else if wizardStep === 2}
            <h2 class="text-lg font-semibold">When</h2>
            <div class="space-y-5 max-w-sm">
              <div class="space-y-1.5">
                <label class="text-sm font-medium">Date Range</label>
                <div class="grid grid-cols-2 gap-2">
                  <DatePicker bind:value={startDate} placeholder="Start date" />
                  <DatePicker bind:value={endDate} placeholder="End date" min={startDate} />
                </div>
              </div>

              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-medium">Days of Week</label>
                </div>
                <DayTierPicker value={dayConstraints} on:change={e => dayConstraints = e.detail} />
              </div>

              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <input type="checkbox" id="w-time-enable" bind:checked={enableTimeConstraint} class="rounded" />
                  <label for="w-time-enable" class="text-sm font-medium">Time of day preference</label>
                </div>
                {#if enableTimeConstraint}
                  <div class="flex items-center gap-2 flex-wrap">
                    <input type="number" bind:value={timeStartHour} min="0" max="23" class="w-14 border rounded-md px-2 py-1.5 text-xs bg-background" />
                    <span class="text-sm text-muted-foreground">to</span>
                    <input type="number" bind:value={timeEndHour} min="0" max="23" class="w-14 border rounded-md px-2 py-1.5 text-xs bg-background" />
                    <select bind:value={timeTier} class="border rounded-md px-2 py-1.5 text-xs bg-background">
                      {#each TIERS as t}<option value={t}>{TIER_LABELS[t]}</option>{/each}
                    </select>
                  </div>
                {/if}
              </div>
            </div>

          {:else if wizardStep === 3}
            <h2 class="text-lg font-semibold">Target Audience</h2>
            <div class="space-y-4">
              <p class="text-sm text-muted-foreground">Select courses your target audience is likely enrolled in. We'll avoid slots near exams and class sessions for these courses.</p>
              <div class="max-h-52 overflow-y-auto border rounded-md p-2 space-y-0.5 bg-background/50">
                {#each coursesList as course}
                  <label class="flex items-center gap-2 cursor-pointer text-xs py-1 hover:bg-muted/50 px-1 rounded">
                    <input type="checkbox" checked={targetCourses.includes(course.course_code)} on:change={() => toggleCourse(course.course_code)} class="rounded" />
                    <span class="font-mono">{course.course_code}</span>
                    <span class="text-muted-foreground truncate">{course.title}</span>
                  </label>
                {/each}
                {#if coursesList.length === 0}<p class="text-xs text-muted-foreground p-2">Loading courses…</p>{/if}
              </div>

              {#if targetCourses.length > 0}
                <div class="space-y-2">
                  <label class="text-sm font-medium">Midterm Sensitivity</label>
                  <p class="text-xs text-muted-foreground">How aggressively to avoid time slots near target course exams.</p>
                  <div class="flex gap-2">
                    {#each ['low','medium','high'] as s}
                      <button
                        class="flex-1 py-2 text-xs rounded-md border transition-all {midtermSensitivity === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}"
                        on:click={() => midtermSensitivity = s}
                      >{SENSITIVITY_LABELS[s]}</button>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>

          {:else if wizardStep === 4}
            <h2 class="text-lg font-semibold">Venue</h2>
            <div class="space-y-5">
              <div class="space-y-2">
                <label class="text-sm font-medium">Preferred Buildings</label>
                <p class="text-xs text-muted-foreground">Click to add, then set priority.</p>
                <div class="flex flex-wrap gap-2">
                  {#each BUILDINGS as b}
                    {@const bc = buildingConstraints.find(x => x.building === b)}
                    <div class="flex items-center gap-1">
                      <button
                        class="px-3 py-1.5 text-xs rounded-md border transition-all
                          {bc ? 'bg-primary/10 text-primary border-primary/30' : 'border-border hover:bg-accent'}"
                        on:click={() => toggleBuilding(b)}
                      >{b}{bc ? ' ✓' : ''}</button>
                      {#if bc}
                        <select class="text-xs border rounded px-1 py-1 bg-background" value={bc.tier} on:change={e => setBuildingTier(b, e.target.value)}>
                          {#each TIERS as t}<option value={t}>{TIER_LABELS[t]}</option>{/each}
                        </select>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium">Excluded Rooms</label>
                <p class="text-xs text-muted-foreground">Search for specific rooms to block from results.</p>
                <div class="relative">
                  <input
                    type="text" value={roomSearchQuery} on:input={onRoomSearchInput}
                    placeholder="Search by building or room…"
                    class="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  />
                  {#if roomSearchResults.length > 0}
                    <div class="absolute z-10 top-full left-0 right-0 mt-1 border rounded-md bg-popover shadow-md overflow-hidden">
                      {#each roomSearchResults as room}
                        <button class="w-full text-left px-3 py-2 text-xs hover:bg-accent flex justify-between" on:click={() => addExcludedRoom(room)}>
                          <span class="font-medium">{room.building} {room.room_number}</span>
                          <span class="text-muted-foreground">cap {room.max_capacity}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
                {#if excludedRooms.length > 0}
                  <div class="flex flex-wrap gap-1.5 mt-1">
                    {#each excludedRooms as room}
                      <span class="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20">
                        {room.building} {room.room_number}
                        <button class="ml-0.5 hover:opacity-70" on:click={() => removeExcludedRoom(room.location_id)}>✕</button>
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

          {:else if wizardStep === 5}
            <h2 class="text-lg font-semibold">Review & Generate</h2>
            <div class="text-sm space-y-3">
              <div class="grid grid-cols-2 gap-x-6 gap-y-2">
                <div><span class="text-muted-foreground">Duration:</span> <span class="font-medium">{durationMinutes} min</span></div>
                <div><span class="text-muted-foreground">Dates:</span> <span class="font-medium">{startDate || 'any'} → {endDate || 'any'}</span></div>
                <div><span class="text-muted-foreground">Time window:</span> <span class="font-medium">{enableTimeConstraint ? `${timeStartHour}:00 to ${timeEndHour}:00 (${TIER_LABELS[timeTier]})` : 'Any'}</span></div>
                <div><span class="text-muted-foreground">Target courses:</span> <span class="font-medium">{targetCourses.length > 0 ? targetCourses.join(', ') : 'None'}</span></div>
                <div><span class="text-muted-foreground">Midterm sensitivity:</span> <span class="font-medium">{targetCourses.length > 0 ? midtermSensitivity : 'N/A'}</span></div>
                <div><span class="text-muted-foreground">Buildings:</span> <span class="font-medium">{buildingConstraints.length > 0 ? buildingConstraints.map(b => `${b.building} (${TIER_LABELS[b.tier]})`).join(', ') : 'Any'}</span></div>
                <div><span class="text-muted-foreground">Days:</span> <span class="font-medium">{dayConstraints.length > 0 ? dayConstraints.map(d => `${d.day}·${d.tier.slice(0,3)}`).join(', ') : 'Any'}</span></div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Wizard nav -->
        <div class="flex justify-between">
          <button
            class="px-4 py-2 text-sm border rounded-md hover:bg-accent disabled:opacity-30"
            disabled={wizardStep === 1}
            on:click={() => wizardStep--}
          >← Back</button>
          {#if wizardStep < 5}
            <button class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90" on:click={() => wizardStep++}>Next →</button>
          {:else}
            <button
              class="px-6 py-2 text-sm bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 disabled:opacity-50"
              disabled={searching}
              on:click={handleSearch}
            >{searching ? 'Calculating…' : 'Generate Suggestions'}</button>
          {/if}
        </div>

      {:else}
        <!-- ═══════════════════════════════════════════════════════════ -->
        <!-- ADVANCED MODE                                                -->
        <!-- ═══════════════════════════════════════════════════════════ -->
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">

          <!-- Left: constraint form -->
          <div class="lg:col-span-2 space-y-5">

            <div class="border rounded-lg p-4 bg-card space-y-4">
              <h3 class="font-semibold text-sm">Basics</h3>
              <div class="space-y-1.5">
                <label class="text-xs text-muted-foreground font-medium" for="a-duration">Duration</label>
                <select id="a-duration" bind:value={durationMinutes} class="w-full border rounded-md px-3 py-1.5 text-sm bg-background">
                  <option value={30}>30 min</option><option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option><option value={120}>2 hours</option>
                  <option value={180}>3 hours</option>
                </select>
              </div>
              <div class="space-y-1.5">
                <label class="text-xs text-muted-foreground font-medium">Date Range</label>
                <div class="grid grid-cols-2 gap-2">
                  <DatePicker bind:value={startDate} placeholder="Start date" />
                  <DatePicker bind:value={endDate} placeholder="End date" min={startDate} />
                </div>
              </div>
            </div>

            <div class="border rounded-lg p-4 bg-card space-y-4">
              <h3 class="font-semibold text-sm">Schedule Constraints</h3>
              <div class="space-y-2">
                <label class="text-xs text-muted-foreground font-medium">Days of Week</label>
                <DayTierPicker value={dayConstraints} on:change={e => dayConstraints = e.detail} />
              </div>
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <input type="checkbox" id="a-time-enable" bind:checked={enableTimeConstraint} class="rounded" />
                  <label for="a-time-enable" class="text-xs font-medium text-muted-foreground">Time of day</label>
                </div>
                {#if enableTimeConstraint}
                  <div class="flex items-center gap-2 flex-wrap">
                    <input type="number" bind:value={timeStartHour} min="0" max="23" class="w-14 border rounded-md px-2 py-1.5 text-xs bg-background" />
                    <span class="text-xs text-muted-foreground">to</span>
                    <input type="number" bind:value={timeEndHour} min="0" max="23" class="w-14 border rounded-md px-2 py-1.5 text-xs bg-background" />
                    <select bind:value={timeTier} class="border rounded-md px-2 py-1.5 text-xs bg-background">
                      {#each TIERS as t}<option value={t}>{TIER_LABELS[t]}</option>{/each}
                    </select>
                  </div>
                {/if}
              </div>
            </div>

            <div class="border rounded-lg p-4 bg-card space-y-4">
              <h3 class="font-semibold text-sm">Target Audience</h3>
              <div class="max-h-44 overflow-y-auto border rounded-md p-2 space-y-0.5 bg-background/50 text-xs">
                {#each coursesList as course}
                  <label class="flex items-center gap-2 cursor-pointer py-0.5 hover:bg-muted/50 px-1 rounded">
                    <input type="checkbox" checked={targetCourses.includes(course.course_code)} on:change={() => toggleCourse(course.course_code)} class="rounded" />
                    <span class="font-mono">{course.course_code}</span>
                    <span class="text-muted-foreground truncate">{course.title}</span>
                  </label>
                {/each}
              </div>
              {#if targetCourses.length > 0}
                <div class="space-y-1.5">
                  <label class="text-xs text-muted-foreground font-medium">Midterm Sensitivity</label>
                  <div class="flex gap-1.5">
                    {#each ['low','medium','high'] as s}
                      <button class="flex-1 py-1.5 text-[10px] rounded border transition-all {midtermSensitivity === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}"
                        on:click={() => midtermSensitivity = s}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>

            <div class="border rounded-lg p-4 bg-card space-y-4">
              <h3 class="font-semibold text-sm">Venue</h3>
              <div class="flex flex-wrap gap-2">
                {#each BUILDINGS as b}
                  {@const bc = buildingConstraints.find(x => x.building === b)}
                  <div class="flex items-center gap-1">
                    <button
                      class="px-2.5 py-1 text-xs rounded border {bc ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border hover:bg-accent'}"
                      on:click={() => toggleBuilding(b)}
                    >{b}</button>
                    {#if bc}
                      <select class="text-[10px] border rounded px-1 py-0.5 bg-background" value={bc.tier} on:change={e => setBuildingTier(b, e.target.value)}>
                        {#each TIERS as t}<option value={t}>{TIER_LABELS[t]}</option>{/each}
                      </select>
                    {/if}
                  </div>
                {/each}
              </div>
              <div class="space-y-2">
                <label class="text-xs text-muted-foreground font-medium">Excluded Rooms</label>
                <div class="relative">
                  <input
                    type="text" value={roomSearchQuery} on:input={onRoomSearchInput}
                    placeholder="Search to exclude a room…"
                    class="w-full border rounded-md px-3 py-1.5 text-xs bg-background"
                  />
                  {#if roomSearchResults.length > 0}
                    <div class="absolute z-10 top-full left-0 right-0 mt-1 border rounded-md bg-popover shadow-md overflow-hidden">
                      {#each roomSearchResults as room}
                        <button class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex justify-between" on:click={() => addExcludedRoom(room)}>
                          <span class="font-medium">{room.building} {room.room_number}</span>
                          <span class="text-muted-foreground">cap {room.max_capacity}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
                {#if excludedRooms.length > 0}
                  <div class="flex flex-wrap gap-1.5">
                    {#each excludedRooms as room}
                      <span class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md bg-destructive/10 text-destructive border border-destructive/20">
                        {room.building} {room.room_number}
                        <button class="hover:opacity-70" on:click={() => removeExcludedRoom(room.location_id)}>✕</button>
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

            <button
              class="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm hover:bg-primary/90 disabled:opacity-50"
              disabled={searching}
              on:click={handleSearch}
            >{searching ? 'Calculating…' : 'Generate Suggestions'}</button>
          </div>

          <!-- Right: results -->
          <div class="lg:col-span-3">
            {#if searching}
              <div class="space-y-3">
                {#each Array(3) as _}
                  <div class="h-32 rounded-xl border bg-card/50 shimmer"></div>
                {/each}
              </div>
            {:else if recommendations}
              <div class="space-y-4">
                <div class="flex gap-1 bg-muted rounded-lg p-1 w-fit">
                  <button class="px-3 py-1 text-sm rounded-md {outputTab === 'curated' ? 'bg-background shadow font-medium' : 'text-muted-foreground'}" on:click={() => outputTab = 'curated'}>Curated Picks</button>
                  <button class="px-3 py-1 text-sm rounded-md {outputTab === 'all' ? 'bg-background shadow font-medium' : 'text-muted-foreground'}" on:click={() => outputTab = 'all'}>All Options ({recommendations.allOptions.length})</button>
                </div>
                {#if outputTab === 'curated'}
                  <div class="space-y-4">
                    {#each recommendations.curatedPicks as rec, i}
                      <SchedulerInsightCard recommendation={rec} rank={i + 1} compact={false} on:select={handleSelect} />
                    {/each}
                  </div>
                {:else}
                  <div class="space-y-2">
                    {#each recommendations.allOptions as rec}
                      <SchedulerInsightCard recommendation={rec} compact={true} on:select={handleSelect} />
                    {/each}
                  </div>
                {/if}
              </div>
            {:else}
              <div class="h-64 flex flex-col items-center justify-center border-2 border-dashed rounded-xl text-muted-foreground text-center p-8 space-y-2">
                <p class="text-sm">Set your constraints and click Generate Suggestions.</p>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- ── Output for wizard mode ──────────────────────────────────── -->
      {#if inputMode === 'wizard' && recommendations}
        <div class="space-y-4 mt-2">
          <div class="flex gap-1 bg-muted rounded-lg p-1 w-fit">
            <button class="px-3 py-1 text-sm rounded-md {outputTab === 'curated' ? 'bg-background shadow font-medium' : 'text-muted-foreground'}" on:click={() => outputTab = 'curated'}>Curated Picks</button>
            <button class="px-3 py-1 text-sm rounded-md {outputTab === 'all' ? 'bg-background shadow font-medium' : 'text-muted-foreground'}" on:click={() => outputTab = 'all'}>All Options ({recommendations.allOptions.length})</button>
          </div>
          {#if outputTab === 'curated'}
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {#each recommendations.curatedPicks as rec, i}
                <SchedulerInsightCard recommendation={rec} rank={i + 1} compact={false} on:select={handleSelect} />
              {/each}
            </div>
          {:else}
            <div class="space-y-2">
              {#each recommendations.allOptions as rec}
                <SchedulerInsightCard recommendation={rec} compact={true} on:select={handleSelect} />
              {/each}
            </div>
          {/if}
        </div>
      {:else if inputMode === 'wizard' && searching}
        <div class="space-y-3">
          {#each Array(3) as _}
            <div class="h-32 rounded-xl border bg-card/50 shimmer"></div>
          {/each}
        </div>
      {/if}

    {:else}
      <div class="h-48 flex items-center justify-center border-2 border-dashed rounded-xl text-muted-foreground text-sm">Loading your RSO access…</div>
    {/if}
  {/if}
</div>

<style>
  .shimmer {
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
    background-size: 200% 100%;
    animation: shimmer 2s infinite;
  }
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
</style>
