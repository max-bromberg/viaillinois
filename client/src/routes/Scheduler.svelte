<script>
  import { currentUser, adminRsoIds } from '../stores/auth.js';
  import { navigate } from '../lib/router.js';
  import { recommendVenue } from '../api/venues.js';
  import { showToast } from '../stores/ui.js';

  $: if ($currentUser !== null && $adminRsoIds.length === 0) navigate('/');

  // RSOs this user can schedule for (Board or Editor)
  $: schedulableRsos = ($currentUser?.memberships ?? [])
    .filter(m => ['Board', 'Editor'].includes(m.role));

  // If only one RSO, auto-select it; otherwise null until user picks
  let selectedRso = null;
  $: if (schedulableRsos.length === 1 && !selectedRso) selectedRso = schedulableRsos[0];

  let form = { attendance: '', startTime: '', endTime: '', requiresAV: false };
  let loading = false;
  let venues = null; // null = not yet searched

  async function handleSearch() {
    const n = parseInt(form.attendance);
    if (!form.attendance || isNaN(n) || n < 1) { showToast('Enter a valid attendance count', 'error'); return; }
    if (!form.startTime || !form.endTime) { showToast('Start and end time required', 'error'); return; }
    if (new Date(form.endTime) <= new Date(form.startTime)) { showToast('End time must be after start time', 'error'); return; }
    loading = true;
    try {
      const { venues: v } = await recommendVenue({ attendance: n, startTime: form.startTime, endTime: form.endTime, requiresAV: form.requiresAV });
      venues = v;
      if (v.length === 0) showToast('No venues available for that time slot', 'error');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      loading = false;
    }
  }

  function busynessLabel(weekly_usage) {
    if (weekly_usage == null) return null;
    if (weekly_usage >= 20) return { text: 'High demand', cls: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' };
    if (weekly_usage >= 10) return { text: 'Moderate use', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' };
    return { text: 'Low demand', cls: 'bg-teal-500/15 text-teal-700 dark:text-teal-400' };
  }

  function fitLabel(overhead) {
    if (overhead === 0) return 'Exact fit';
    if (overhead <= 5) return `+${overhead} seats`;
    if (overhead <= 20) return `+${overhead} seats`;
    return `+${overhead} seats`;
  }

  function fitClass(overhead) {
    if (overhead <= 5) return 'text-teal-700 dark:text-teal-400';
    if (overhead <= 20) return 'text-foreground';
    return 'text-muted-foreground';
  }
</script>

<svelte:head>
  <title>Event Scheduler – VIA</title>
</svelte:head>

<div class="max-w-3xl mx-auto space-y-8">

  <!-- Header -->
  <div class="space-y-1">
    <h1 class="text-2xl font-bold">Event Scheduler</h1>
    <p class="text-sm text-muted-foreground">
      Find available rooms that fit your event — ranked by best capacity match.
    </p>
  </div>

  <!-- Beta banner -->
  <div class="rounded-lg border border-amber-400/50 bg-amber-400/10 px-4 py-3 flex gap-3 items-start">
    <svg class="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
    <div class="space-y-0.5">
      <p class="text-sm font-medium text-amber-800 dark:text-amber-300">Early access — expect rough edges</p>
      <p class="text-xs text-amber-700 dark:text-amber-400/80">
        The Smart Scheduler is under active development. Venue availability data may be incomplete,
        recommendations may not reflect all constraints, and the flow will change significantly.
        Do not rely on results for confirmed bookings without cross-checking with your venue contact.
      </p>
    </div>
  </div>

  <!-- RSO picker (only shown when user has access to multiple RSOs) -->
  {#if schedulableRsos.length > 1}
    <div class="space-y-2">
      <p class="text-sm font-medium">Which RSO is this event for?</p>
      <div class="flex flex-wrap gap-2">
        {#each schedulableRsos as rso}
          <button
            class="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border transition-colors
              {selectedRso?.rso_id === rso.rso_id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-accent'}"
            on:click={() => { selectedRso = rso; venues = null; }}
          >
            {#if rso.logo_color}
              <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background-color: {rso.logo_color}"></span>
            {/if}
            {rso.name}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Criteria form (only shown once an RSO is selected) -->
  {#if !selectedRso}
    <p class="text-sm text-muted-foreground">Select an RSO above to continue.</p>
  {/if}

  {#if selectedRso}
  <!-- Criteria form -->
  <div class="border rounded-lg p-5 bg-card shadow-sm space-y-4">
    <p class="text-sm font-medium">Event criteria</p>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div class="space-y-1">
        <label class="text-xs font-medium text-muted-foreground">Expected attendance</label>
        <input
          type="number" min="1"
          placeholder="e.g. 40"
          bind:value={form.attendance}
          class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
        />
      </div>

      <div class="space-y-1 flex items-end">
        <label class="flex items-center gap-2 cursor-pointer pb-1.5">
          <input type="checkbox" bind:checked={form.requiresAV} class="rounded" />
          <span class="text-sm">Requires A/V equipment</span>
        </label>
      </div>

      <div class="space-y-1">
        <label class="text-xs font-medium text-muted-foreground">Start time</label>
        <input
          type="datetime-local"
          bind:value={form.startTime}
          class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
        />
      </div>

      <div class="space-y-1">
        <label class="text-xs font-medium text-muted-foreground">End time</label>
        <input
          type="datetime-local"
          bind:value={form.endTime}
          class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
        />
      </div>
    </div>

    <button
      class="w-full sm:w-auto px-5 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
      disabled={loading}
      on:click={handleSearch}
    >{loading ? 'Searching…' : 'Find available venues'}</button>
  </div>

  <!-- Results -->
  {#if venues !== null}
    <div class="space-y-3">
      <p class="text-sm text-muted-foreground">
        {venues.length === 0 ? 'No venues available for that slot.' : `${venues.length} venue${venues.length !== 1 ? 's' : ''} available — sorted by best fit`}
      </p>

      {#each venues as venue (venue.location_id)}
        {@const busy = busynessLabel(venue.weekly_usage)}
        <div class="border rounded-lg bg-card p-4 flex items-start justify-between gap-4 flex-wrap">
          <div class="space-y-1.5 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold">{venue.building}</span>
              <span class="text-sm text-muted-foreground">Room {venue.room_number}</span>
              {#if venue.has_av_equipment}
                <span class="text-xs px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-400">A/V</span>
              {/if}
              {#if busy}
                <span class="text-xs px-1.5 py-0.5 rounded {busy.cls}">{busy.text}</span>
              {/if}
            </div>
            <p class="text-xs text-muted-foreground">
              Capacity <span class="font-medium text-foreground">{venue.max_capacity}</span>
              · <span class="{fitClass(venue.capacity_overhead)} font-medium">{fitLabel(venue.capacity_overhead)}</span>
              {#if venue.weekly_usage != null}
                · {venue.weekly_usage} class session{venue.weekly_usage !== 1 ? 's' : ''}/week
              {/if}
            </p>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {/if} <!-- /selectedRso -->
</div>
