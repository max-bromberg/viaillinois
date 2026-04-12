<script>
  import { onMount } from 'svelte';
  import { currentUser, adminRsoIds } from '../stores/auth.js';
  import { getRso } from '../api/rsos.js';
  import { createEvent, updateEvent, deleteEvent } from '../api/events.js';
  import EventForm from '../lib/EventForm.svelte';
  import EventCard from '../lib/EventCard.svelte';
  import { Button } from '$lib/components/ui/button';
  import { navigate } from '../lib/router.js';
  import { showToast } from '../stores/ui.js';
  import EventCardSkeleton from '../lib/EventCardSkeleton.svelte';

  let selectedRso = null;
  let events = [];
  let loading = false;
  let showCreateForm = false;
  let editingEvent = null;

  $: if (!$currentUser) navigate('/login');

  async function loadRso(rsoId) {
    loading = true;
    try {
      const { rso } = await getRso(rsoId);
      selectedRso = rso;
      events = rso.events || [];
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if ($adminRsoIds.length) loadRso($adminRsoIds[0]);
  });

  async function handleCreate(e) {
    loading = true;
    try {
      await createEvent(e.detail);
      showToast('Event created');
      showCreateForm = false;
      await loadRso(selectedRso.rso_id);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  }

  async function handleUpdate(e) {
    loading = true;
    try {
      await updateEvent(editingEvent.event_id, e.detail);
      showToast('Event updated');
      editingEvent = null;
      await loadRso(selectedRso.rso_id);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  }

  async function handleDelete(eventId) {
    if (!confirm('Delete this event?')) return;
    loading = true;
    try {
      await deleteEvent(eventId);
      showToast('Event deleted');
      await loadRso(selectedRso.rso_id);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  }

  function startEdit(event) {
    editingEvent = event;
    showCreateForm = false;
  }

  function cancelEdit() {
    editingEvent = null;
  }

  function openCreateForm() {
    showCreateForm = true;
    editingEvent = null;
  }

  function cancelCreate() {
    showCreateForm = false;
  }
</script>

{#if !$currentUser}
  <div class="flex items-center justify-center min-h-[60vh]">
    <p class="text-muted-foreground">Redirecting to login…</p>
  </div>
{:else if $adminRsoIds.length === 0}
  <div class="max-w-lg mx-auto mt-20 text-center space-y-3">
    <h2 class="text-xl font-semibold">No RSO Access</h2>
    <p class="text-muted-foreground">
      You are not listed as an Admin or Board member of any RSO.
      Contact your RSO's administrator to be added.
    </p>
  </div>
{:else}
  <div class="max-w-5xl mx-auto px-4 py-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">
          {selectedRso ? selectedRso.name : 'Dashboard'}
        </h1>
        {#if selectedRso?.description}
          <p class="text-sm text-muted-foreground mt-0.5">{selectedRso.description}</p>
        {/if}
      </div>
      <Button on:click={openCreateForm} disabled={loading || showCreateForm}>
        + New Event
      </Button>
    </div>

    <!-- RSO selector if user admins multiple RSOs -->
    {#if $adminRsoIds.length > 1}
      <div class="flex gap-2 flex-wrap">
        {#each ($currentUser?.memberships ?? []).filter(m => ['Admin', 'Board'].includes(m.role)) as m}
          <button
            type="button"
            class="text-sm px-3 py-1 rounded-full border transition-colors
              {selectedRso?.rso_id === m.rso_id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-accent'}"
            on:click={() => { editingEvent = null; showCreateForm = false; loadRso(m.rso_id); }}
          >
            {m.name}
          </button>
        {/each}
      </div>
    {/if}

    <!-- Create form panel -->
    {#if showCreateForm && selectedRso}
      <section class="border rounded-lg p-6 bg-card shadow-sm space-y-4">
        <h2 class="text-lg font-semibold">New Event</h2>
        <EventForm
          rsoId={selectedRso.rso_id}
          {loading}
          on:submit={handleCreate}
          on:cancel={cancelCreate}
        />
      </section>
    {/if}

    <!-- Loading state -->
    {#if loading && !selectedRso}
      <div class="flex items-center justify-between">
        <div class="shimmer h-7 w-48"></div>
        <div class="shimmer h-9 w-24 rounded-md"></div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each Array(6) as _}
          <EventCardSkeleton />
        {/each}
      </div>
    {/if}

    <!-- Events grid -->
    {#if selectedRso}
      {#if events.length === 0 && !showCreateForm}
        <div class="text-center py-16 text-muted-foreground space-y-2">
          <p class="text-lg">No events yet.</p>
          <p class="text-sm">Click <strong>+ New Event</strong> to create your first event.</p>
        </div>
      {:else}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each events as event (event.event_id)}
            <div class="group relative">
              <EventCard {event} compact />

              <!-- Edit / Delete overlay buttons, visible on hover -->
              <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  class="text-xs px-2 py-1 rounded bg-background border hover:bg-accent transition-colors shadow-sm"
                  on:click={() => startEdit(event)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="text-xs px-2 py-1 rounded bg-background border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors shadow-sm"
                  on:click={() => handleDelete(event.event_id)}
                >
                  Delete
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}

    <!-- Edit form (inline section) -->
    {#if editingEvent && selectedRso}
      <section class="border rounded-lg p-6 bg-card shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Edit Event</h2>
          <button
            type="button"
            class="text-sm text-muted-foreground hover:text-foreground transition-colors"
            on:click={cancelEdit}
          >
            x Close
          </button>
        </div>
        <EventForm
          rsoId={selectedRso.rso_id}
          initial={editingEvent}
          {loading}
          on:submit={handleUpdate}
          on:cancel={cancelEdit}
        />
      </section>
    {/if}
  </div>
{/if}
