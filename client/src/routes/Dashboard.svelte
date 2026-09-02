<script>
  import { locationLabel } from '../lib/locationLabel.js';
  import { campusDate, campusTime } from '../lib/campusTime.js';
  import { onMount } from 'svelte';
  import { currentUser, adminRsoIds, boardRsoIds } from '../stores/auth.js';
  import { getMe } from '../api/users.js';
  import { getRso, updateRso, addMember, removeMember, getRsoStats } from '../api/rsos.js';
  import { createEvent, createEventSeries, updateEvent, deleteEvent } from '../api/events.js';
  import { getCurrentSemester } from '../api/semester.js';
  import { recurrenceLabel } from '../lib/recurrenceLabel.js';
  import EventForm from '../lib/EventForm.svelte';
  import CalendarImport from '../lib/CalendarImport.svelte';
  import { navigate } from '../lib/router.js';
  import { showToast } from '../stores/ui.js';

  $: if (!$currentUser) navigate('/login');

  // ── Selected RSO ──────────────────────────────────────────────────────────
  let selectedRso = null;
  let loading = false;
  let activeTab = 'events';

  // ── Derived role for selected RSO ─────────────────────────────────────────
  $: userRole = $currentUser?.memberships?.find(m => m.rso_id === selectedRso?.rso_id)?.role
    ?? ($currentUser?.is_global_admin ? 'Board' : null);
  $: isBoard = userRole === 'Board';

  // ── Dashboard-accessible RSO list (Board + Editor) ────────────────────────
  $: dashboardMemberships = ($currentUser?.memberships ?? [])
    .filter(m => ['Board', 'Editor'].includes(m.role));

  // ── Events tab state ──────────────────────────────────────────────────────
  let events = [];
  let showCreateForm = false;
  let editingEvent = null;
  let semester = null;
  /**
   * A change to one week of a series and a change to the series are different
   * things, so one is held here until the board says which it meant.
   */
  let pendingScope = null;

  // ── Members tab state ─────────────────────────────────────────────────────
  let memberForm = { netId: '', role: 'Member' };
  let confirmRemoveNetId = null;

  // ── RSO Details tab state ─────────────────────────────────────────────────
  let detailsForm = { name: '', description: '', logo_color: '#000000', founded_year: '' };
  let detailsDirty = false;

  // ── Insights tab state ────────────────────────────────────────────────────
  let insights = null;
  let insightsLoading = false;

  async function loadInsights(rsoId) {
    insightsLoading = true;
    try {
      insights = await getRsoStats(rsoId);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      insightsLoading = false;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const fmtDate = d => campusDate(d, { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtTime = d => campusTime(d);
  function roleBadgeClass(role) {
    if (role === 'Board')  return 'bg-primary/15 text-primary';
    if (role === 'Editor') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
    return 'bg-muted text-muted-foreground';
  }

  // ── Load RSO ──────────────────────────────────────────────────────────────
  async function loadRso(rsoId) {
    loading = true;
    editingEvent = null;
    showCreateForm = false;
    confirmRemoveNetId = null;
    try {
      const { rso } = await getRso(rsoId);
      selectedRso = rso;
      events = rso.events || [];
      detailsForm = {
        name: rso.name || '',
        description: rso.description || '',
        logo_color: rso.logo_color || '#000000',
        founded_year: rso.founded_year || '',
      };
      detailsDirty = false;
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    try {
      const { user } = await getMe();
      currentUser.set(user);
    } catch { /* session expired */ }
    try {
      // The repeat controls default to the end of instruction, and the date
      // they arrive at is shown so it can be corrected.
      ({ semester } = await getCurrentSemester());
    } catch {
      semester = null;
    }
    if ($adminRsoIds.length) loadRso($adminRsoIds[0]);
  });

  // ── Event handlers ────────────────────────────────────────────────────────
  async function handleCreate(e) {
    loading = true;
    try {
      if (e.detail.recurrence) {
        const { created, skipped } = await createEventSeries(e.detail);
        showToast(
          skipped?.length
            ? `Created ${created} events. These weeks were left out because the room was taken: ${skipped.join(', ')}.`
            : `Created ${created} events`,
          skipped?.length ? 'error' : undefined
        );
      } else {
        await createEvent(e.detail);
        showToast('Event created');
      }
      showCreateForm = false;
      await loadRso(selectedRso.rso_id);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  }

  function handleUpdate(e) {
    // An occurrence of a series could mean this week, this week onwards, or
    // every week, and only the board knows which.
    if (editingEvent?.series_id) {
      pendingScope = { kind: 'update', event: editingEvent, payload: e.detail };
      return;
    }
    applyUpdate(editingEvent.event_id, e.detail, 'one');
  }

  async function applyUpdate(eventId, payload, scope) {
    loading = true;
    try {
      await updateEvent(eventId, payload, scope);
      showToast(scope === 'one' ? 'Event updated' : 'Events updated');
      editingEvent = null;
      await loadRso(selectedRso.rso_id);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  }

  function handleDelete(event) {
    if (event.series_id) {
      pendingScope = { kind: 'delete', event };
      return;
    }
    applyDelete(event.event_id, 'one');
  }

  async function applyDelete(eventId, scope) {
    loading = true;
    try {
      await deleteEvent(eventId, scope);
      showToast(scope === 'one' ? 'Event deleted' : 'Events deleted');
      await loadRso(selectedRso.rso_id);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  }

  async function chooseScope(scope) {
    const asked = pendingScope;
    pendingScope = null;
    if (!asked) return;
    if (asked.kind === 'delete') return applyDelete(asked.event.event_id, scope);
    return applyUpdate(asked.event.event_id, asked.payload, scope);
  }

  // ── Member handlers ───────────────────────────────────────────────────────
  async function handleAddMember() {
    if (!memberForm.netId.trim()) return;
    try {
      const result = await addMember(selectedRso.rso_id, memberForm);
      const parts = [`${result.added} added`];
      if (result.invited?.length) {
        parts.push(`${result.invited.length} invited, who will find themselves a member when they first sign in`);
      }
      showToast(parts.join('. '));
      if (result.rejected?.length) {
        showToast(`Could not read: ${result.rejected.join(', ')}`, 'error');
      }
      memberForm = { netId: '', role: 'Member' };
      await loadRso(selectedRso.rso_id);
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function handleRemoveMember(netId) {
    try {
      await removeMember(selectedRso.rso_id, netId);
      showToast('Member removed');
      confirmRemoveNetId = null;
      await loadRso(selectedRso.rso_id);
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // ── Details handlers ──────────────────────────────────────────────────────
  async function handleSaveDetails() {
    loading = true;
    try {
      await updateRso(selectedRso.rso_id, detailsForm);
      showToast('RSO details updated');
      detailsDirty = false;
      await loadRso(selectedRso.rso_id);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      loading = false;
    }
  }

  function switchRso(rsoId) {
    activeTab = 'events';
    insights = null;
    loadRso(rsoId);
  }
</script>

{#if !$currentUser}
  <div class="flex items-center justify-center min-h-[60vh]">
    <p class="text-muted-foreground">Redirecting to login…</p>
  </div>
{:else if $adminRsoIds.length === 0}
  <div class="max-w-lg mx-auto mt-20 text-center space-y-3">
    <h2 class="text-xl font-semibold">No RSO Access</h2>
    <p class="text-muted-foreground text-sm">
      You are not listed as a Board member or Editor of any RSO.
      Contact your RSO's board to be added.
    </p>
  </div>
{:else}
  <div class="max-w-5xl mx-auto px-4 py-8 space-y-5">

    <!-- Header -->
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          {#if selectedRso?.logo_color}
            <span class="w-4 h-4 rounded-sm flex-shrink-0" style="background-color: {selectedRso.logo_color}"></span>
          {/if}
          <h1 class="text-2xl font-bold truncate">{selectedRso?.name ?? 'Dashboard'}</h1>
          {#if userRole}
            <span class="text-xs px-2 py-0.5 rounded-full font-medium {roleBadgeClass(userRole)}">{userRole}</span>
          {/if}
        </div>
        {#if selectedRso?.description}
          <p class="text-sm text-muted-foreground mt-0.5">{selectedRso.description}</p>
        {/if}
      </div>

      <!-- RSO selector pills -->
      {#if dashboardMemberships.length > 1}
        <div class="flex gap-2 flex-wrap">
          {#each dashboardMemberships as m}
            <button
              class="text-sm px-3 py-1 rounded-full border transition-colors
                {selectedRso?.rso_id === m.rso_id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-accent'}"
              on:click={() => switchRso(m.rso_id)}
            >{m.name}</button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Tabs -->
    {#if selectedRso}
      <div class="flex gap-1 border-b">
        <button
          class="px-4 py-2 text-sm font-medium transition-colors
            {activeTab === 'events' ? 'border-b-2 border-primary text-primary -mb-px' : 'text-muted-foreground hover:text-foreground'}"
          on:click={() => { activeTab = 'events'; editingEvent = null; showCreateForm = false; }}
        >Events</button>
        <button
          class="px-4 py-2 text-sm font-medium transition-colors
            {activeTab === 'insights' ? 'border-b-2 border-primary text-primary -mb-px' : 'text-muted-foreground hover:text-foreground'}"
          on:click={() => { activeTab = 'insights'; if (!insights) loadInsights(selectedRso.rso_id); }}
        >Insights</button>
        {#if isBoard}
          <button
            class="px-4 py-2 text-sm font-medium transition-colors
              {activeTab === 'members' ? 'border-b-2 border-primary text-primary -mb-px' : 'text-muted-foreground hover:text-foreground'}"
            on:click={() => { activeTab = 'members'; confirmRemoveNetId = null; }}
          >Members</button>
          <button
            class="px-4 py-2 text-sm font-medium transition-colors
              {activeTab === 'details' ? 'border-b-2 border-primary text-primary -mb-px' : 'text-muted-foreground hover:text-foreground'}"
            on:click={() => activeTab = 'details'}
          >RSO Details</button>
        {/if}
      </div>
    {/if}

    <!-- ── Events Tab ─────────────────────────────────────────────────────── -->
    {#if activeTab === 'events' && selectedRso}
      <div class="space-y-4">
        <div class="flex justify-end gap-2">
          <button
            class="px-3 py-1.5 text-sm border border-input rounded-md hover:bg-accent transition-colors disabled:opacity-50"
            disabled={loading || showCreateForm || !!editingEvent}
            on:click={() => { showCreateForm = true; editingEvent = null; }}
          >+ Manual entry</button>
          <button
            class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors flex items-center gap-1.5"
            on:click={() => navigate('/scheduler')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            Smart Scheduler
          </button>
        </div>

        <!-- Create form -->
        {#if showCreateForm}
          <section class="border rounded-lg p-6 bg-card shadow-sm space-y-4">
            <div class="flex items-center justify-between">
              <h2 class="text-base font-semibold">New Event</h2>
              <button class="text-sm text-muted-foreground hover:text-foreground" on:click={() => showCreateForm = false}>✕ Close</button>
            </div>
            <EventForm rsoId={selectedRso.rso_id} {semester} {loading} on:submit={handleCreate} on:cancel={() => showCreateForm = false} />
          </section>
        {/if}

        <!-- Import from a calendar file -->
        {#if showCreateForm}
          <section class="border rounded-lg p-6 bg-card shadow-sm">
            <CalendarImport kind="events" rsoId={selectedRso.rso_id} />
          </section>
        {/if}

        <!-- Edit form -->
        {#if editingEvent}
          <section class="border rounded-lg p-6 bg-card shadow-sm space-y-4">
            <div class="flex items-center justify-between">
              <h2 class="text-base font-semibold">Edit Event</h2>
              <button class="text-sm text-muted-foreground hover:text-foreground" on:click={() => editingEvent = null}>✕ Close</button>
            </div>
            <EventForm rsoId={selectedRso.rso_id} initial={editingEvent} {semester} {loading} on:submit={handleUpdate} on:cancel={() => editingEvent = null} />
          </section>
        {/if}

        <!-- Events table -->
        {#if loading && events.length === 0}
          <div class="border rounded-lg overflow-hidden bg-card">
            {#each Array(4) as _}
              <div class="px-4 py-3 border-b flex gap-4">
                <div class="shimmer h-4 w-48 rounded"></div>
                <div class="shimmer h-4 w-24 rounded"></div>
                <div class="shimmer h-4 w-32 rounded"></div>
              </div>
            {/each}
          </div>
        {:else if events.length === 0 && !showCreateForm}
          <div class="text-center py-16 text-muted-foreground space-y-2">
            <p>No events yet.</p>
            <p class="text-sm">Click <strong>+ New Event</strong> to get started.</p>
          </div>
        {:else if events.length > 0}
          <div class="border rounded-lg overflow-hidden bg-card">
            <table class="w-full text-sm text-left">
              <thead class="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th class="px-4 py-2.5">Title</th>
                  <th class="px-4 py-2.5 hidden sm:table-cell">Type</th>
                  <th class="px-4 py-2.5 hidden md:table-cell">Date</th>
                  <th class="px-4 py-2.5 hidden lg:table-cell">Location</th>
                  <th class="px-4 py-2.5 hidden lg:table-cell">Tags</th>
                  <th class="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {#each events as event (event.event_id)}
                  <tr class="border-t hover:bg-muted/40 transition-colors {editingEvent?.event_id === event.event_id ? 'bg-primary/5' : ''}">
                    <td class="px-4 py-2.5 font-medium max-w-[12rem] truncate">
                      {event.title}
                      {#if event.series_id}
                        <span
                          class="ml-1 align-middle text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                          title={recurrenceLabel(event)}
                        >Repeats</span>
                      {/if}
                    </td>
                    <td class="px-4 py-2.5 hidden sm:table-cell">
                      <span class="text-xs px-1.5 py-0.5 rounded {event.is_private ? 'bg-orange-500/15 text-orange-700 dark:text-orange-400' : 'bg-sky-500/15 text-sky-700 dark:text-sky-400'}">
                        {event.is_private ? 'Internal' : 'Public'}
                      </span>
                    </td>
                    <td class="px-4 py-2.5 hidden md:table-cell text-muted-foreground whitespace-nowrap">
                      {fmtDate(event.start_time)}<br/>
                      <span class="text-xs">{fmtTime(event.start_time)} to {fmtTime(event.end_time)}</span>
                    </td>
                    <td class="px-4 py-2.5 hidden lg:table-cell text-muted-foreground">
                      {locationLabel(event)}
                    </td>
                    <td class="px-4 py-2.5 hidden lg:table-cell max-w-[10rem]">
                      {#if event.tags}
                        <span class="text-xs text-muted-foreground truncate block">{event.tags}</span>
                      {/if}
                    </td>
                    <td class="px-4 py-2.5 text-right">
                      <div class="flex gap-1.5 justify-end">
                        <button
                          class="text-xs px-2.5 py-1 rounded border hover:bg-accent transition-colors"
                          on:click={() => { editingEvent = event; showCreateForm = false; }}
                        >Edit</button>
                        <button
                          title="Create poster"
                          class="text-xs px-2.5 py-1 rounded border border-teal-500/50 text-teal-700 dark:text-teal-400 hover:bg-teal-500/10 transition-colors flex items-center gap-1"
                          on:click={() => navigate(`/poster?event=${event.event_id}&rso=${selectedRso.rso_id}`)}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                          Poster
                        </button>
                        <button
                          class="text-xs px-2.5 py-1 rounded border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors"
                          on:click={() => handleDelete(event)}
                        >Delete</button>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {/if}

    {#if pendingScope}
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
        <div class="w-full max-w-md rounded-xl border bg-card p-6 space-y-4 shadow-lg">
          <div class="space-y-1">
            <h2 class="text-base font-semibold">
              {pendingScope.kind === 'delete' ? 'Delete a repeating event' : 'Change a repeating event'}
            </h2>
            <p class="text-sm text-muted-foreground">{recurrenceLabel(pendingScope.event)}.</p>
          </div>
          <div class="flex flex-col gap-2">
            <button class="text-sm px-3 py-2 rounded border hover:bg-accent transition-colors text-left"
              on:click={() => chooseScope('one')}>This event only</button>
            <button class="text-sm px-3 py-2 rounded border hover:bg-accent transition-colors text-left"
              on:click={() => chooseScope('following')}>This and all later events</button>
            <button class="text-sm px-3 py-2 rounded border hover:bg-accent transition-colors text-left"
              on:click={() => chooseScope('all')}>All events in the series</button>
          </div>
          <button class="text-xs text-muted-foreground hover:text-foreground" on:click={() => pendingScope = null}>
            Cancel
          </button>
        </div>
      </div>
    {/if}

    <!-- ── Insights Tab ──────────────────────────────────────────────────── -->
    {#if activeTab === 'insights' && selectedRso}
      <div class="space-y-6">
        {#if insightsLoading}
          <p class="text-sm text-muted-foreground">Loading insights…</p>
        {:else if insights}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <!-- Member Breakdown -->
            <div class="border rounded-lg p-5 bg-card shadow-sm space-y-3">
              <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Members by Role</h3>
              {#if insights.memberBreakdown.length === 0}
                <p class="text-sm text-muted-foreground">No members yet.</p>
              {:else}
                <ul class="space-y-2">
                  {#each insights.memberBreakdown as row}
                    <li class="flex items-center justify-between text-sm">
                      <span class="font-medium">{row.role}</span>
                      <span class="tabular-nums text-muted-foreground">{row.count}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>

            <!-- Top Tags -->
            <div class="border rounded-lg p-5 bg-card shadow-sm space-y-3">
              <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Top Tags</h3>
              {#if insights.topTags.length === 0}
                <p class="text-sm text-muted-foreground">No events with tags yet.</p>
              {:else}
                <ul class="space-y-2">
                  {#each insights.topTags as row}
                    <li class="flex items-center justify-between text-sm">
                      <span class="font-medium">{row.tag_name}</span>
                      <span class="tabular-nums text-muted-foreground">{row.usage_count} event{row.usage_count !== 1 ? 's' : ''}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>

          </div>
        {:else}
          <p class="text-sm text-muted-foreground">Click Insights to load stats.</p>
        {/if}
      </div>
    {/if}

    <!-- ── Members Tab (Board only) ───────────────────────────────────────── -->
    {#if activeTab === 'members' && selectedRso && isBoard}
      <div class="space-y-4">
        <!-- Members table -->
        <div class="border rounded-lg overflow-hidden bg-card">
          <table class="w-full text-sm text-left">
            <thead class="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th class="px-4 py-2.5">Name</th>
                <th class="px-4 py-2.5 hidden sm:table-cell">NetID</th>
                <th class="px-4 py-2.5">Role</th>
                <th class="px-4 py-2.5 hidden md:table-cell">Joined</th>
                <th class="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#if !selectedRso.members || selectedRso.members.length === 0}
                <tr><td colspan="5" class="px-4 py-8 text-center text-muted-foreground">No members yet.</td></tr>
              {:else}
                {#each selectedRso.members as member (member.net_id)}
                  <tr class="border-t hover:bg-muted/40 transition-colors">
                    <td class="px-4 py-2.5 font-medium">
                      {member.full_name || member.net_id}
                      {#if member.invited_at}
                        <span class="ml-2 text-xs font-normal px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                          invited
                        </span>
                      {/if}
                    </td>
                    <td class="px-4 py-2.5 hidden sm:table-cell text-muted-foreground">{member.net_id}</td>
                    <td class="px-4 py-2.5">
                      <span class="text-xs px-1.5 py-0.5 rounded font-medium {roleBadgeClass(member.role)}">{member.role}</span>
                    </td>
                    <td class="px-4 py-2.5 hidden md:table-cell text-muted-foreground text-xs">
                      {member.joined_at ? fmtDate(member.joined_at) : 'unknown'}
                    </td>
                    <td class="px-4 py-2.5 text-right">
                      {#if confirmRemoveNetId === member.net_id}
                        <span class="flex items-center gap-1.5 justify-end">
                          <span class="text-xs text-destructive">Remove?</span>
                          <button class="text-xs px-2 py-1 rounded bg-destructive text-white hover:bg-destructive/90 transition-colors"
                            on:click={() => handleRemoveMember(member.net_id)}>Yes</button>
                          <button class="text-xs px-2 py-1 rounded border hover:bg-accent transition-colors"
                            on:click={() => confirmRemoveNetId = null}>Cancel</button>
                        </span>
                      {:else}
                        <button
                          class="text-xs px-2.5 py-1 rounded border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors"
                          on:click={() => confirmRemoveNetId = member.net_id}
                        >Remove</button>
                      {/if}
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>

        <!-- Add member form -->
        <div class="border rounded-lg p-4 bg-card space-y-3">
          <p class="text-sm font-medium">Add Member</p>
          <div class="flex gap-2 flex-wrap">
            <input
              class="border rounded-md px-3 py-1.5 text-sm bg-background flex-1 min-w-32"
              placeholder="NetID, or paste a list of NetIDs or Illinois addresses"
              bind:value={memberForm.netId}
            />
            <select class="border rounded-md px-3 py-1.5 text-sm bg-background" bind:value={memberForm.role}>
              <option value="Member">Member</option>
              <option value="Editor">Editor</option>
              <option value="Board">Board</option>
            </select>
            <button
              class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              on:click={handleAddMember}
            >Add</button>
          </div>
          <p class="text-xs text-muted-foreground">
            <strong>Member</strong>: view access only ·
            <strong>Editor</strong>: can create and manage events ·
            <strong>Board</strong>: full RSO management
          </p>
        </div>
      </div>
    {/if}

    <!-- ── RSO Details Tab (Board only) ──────────────────────────────────── -->
    {#if activeTab === 'details' && selectedRso && isBoard}
      <div class="border rounded-lg p-6 bg-card shadow-sm space-y-4 max-w-lg">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="space-y-1 sm:col-span-2">
            <label class="text-xs font-medium text-muted-foreground">Name</label>
            <input class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
              bind:value={detailsForm.name} on:input={() => detailsDirty = true} />
          </div>
          <div class="space-y-1 sm:col-span-2">
            <label class="text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              rows="3"
              class="w-full border rounded-md px-3 py-1.5 text-sm bg-background resize-none"
              bind:value={detailsForm.description}
              on:input={() => detailsDirty = true}
            ></textarea>
          </div>
          <div class="space-y-1">
            <label class="text-xs font-medium text-muted-foreground">Founded Year</label>
            <input class="w-full border rounded-md px-3 py-1.5 text-sm bg-background" type="number"
              placeholder="e.g. 2018" bind:value={detailsForm.founded_year} on:input={() => detailsDirty = true} />
          </div>
          <div class="space-y-1">
            <label class="text-xs font-medium text-muted-foreground">Brand Color</label>
            <div class="flex items-center gap-2">
              <input type="color" class="h-8 w-12 rounded border cursor-pointer"
                bind:value={detailsForm.logo_color} on:input={() => detailsDirty = true} />
              <span class="text-sm text-muted-foreground">{detailsForm.logo_color}</span>
            </div>
          </div>
        </div>
        <button
          class="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          disabled={!detailsDirty || loading}
          on:click={handleSaveDetails}
        >{loading ? 'Saving…' : 'Save changes'}</button>
      </div>
    {/if}

  </div>
{/if}
