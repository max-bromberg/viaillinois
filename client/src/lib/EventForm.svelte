<script>
  import { createEventDispatcher } from 'svelte';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Button } from '$lib/components/ui/button';
  import VenueRecommender from './VenueRecommender.svelte';

  export let rsoId;
  export let initial = {};
  export let loading = false;

  const dispatch = createEventDispatcher();

  const ALL_TAGS = ['Free Food', 'Workshop', 'Social', 'Corporate', 'Competition', 'Weekly Meeting', 'Speaker', 'Networking'];

  let title       = initial.title       || '';
  let description = initial.description || '';
  let startTime   = initial.start_time  ? initial.start_time.slice(0, 16) : '';
  let endTime     = initial.end_time    ? initial.end_time.slice(0, 16) : '';
  let locationId  = initial.location_id || null;
  let isPrivate   = initial.is_private  || false;
  let selectedTags = initial.tags ? initial.tags.split(',').filter(Boolean) : [];
  let selectedVenueLabel = '';

  $: isEditMode = !!initial.event_id;
  $: canSubmit = title && startTime && endTime && endTime > startTime && locationId;

  function toggleTag(tag) {
    selectedTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
  }

  function handleVenueSelect(e) {
    const { location_id, building, room_number } = e.detail;
    locationId = location_id;
    selectedVenueLabel = `${building} ${room_number}`;
  }

  function submit() {
    if (!canSubmit) return;
    dispatch('submit', {
      rso_id: rsoId, title, description,
      start_time: startTime, end_time: endTime,
      location_id: locationId, is_private: isPrivate,
      tags: selectedTags.join(','),
    });
  }
</script>

<form on:submit|preventDefault={submit} class="space-y-5">
  <!-- Title -->
  <div class="space-y-1">
    <Label htmlFor="title">Event Title *</Label>
    <Input id="title" bind:value={title} placeholder="e.g. IEEE Weekly Meeting" required />
  </div>

  <!-- Description -->
  <div class="space-y-1">
    <Label htmlFor="description">Description</Label>
    <textarea
      id="description"
      bind:value={description}
      rows="3"
      placeholder="What's this event about?"
      class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
    ></textarea>
  </div>

  <!-- Date/Time -->
  <div class="grid grid-cols-2 gap-4">
    <div class="space-y-1">
      <Label htmlFor="startTime">Start Time *</Label>
      <Input id="startTime" type="datetime-local" bind:value={startTime} required />
    </div>
    <div class="space-y-1">
      <Label htmlFor="endTime">End Time *</Label>
      <Input id="endTime" type="datetime-local" bind:value={endTime} required />
    </div>
  </div>

  <!-- Tags -->
  <div class="space-y-2">
    <Label>Tags</Label>
    <div class="flex flex-wrap gap-2">
      {#each ALL_TAGS as tag}
        <button
          type="button"
          class="text-xs px-3 py-1 rounded-full border transition-colors
            {selectedTags.includes(tag)
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border hover:bg-accent'}"
          on:click={() => toggleTag(tag)}
        >
          {tag}
        </button>
      {/each}
    </div>
  </div>

  <!-- Venue Recommender -->
  <div class="space-y-2">
    <Label>Venue *</Label>
    {#if selectedVenueLabel}
      <p class="text-sm font-medium text-primary">
        Selected: {selectedVenueLabel}
        <button type="button" class="text-xs text-muted-foreground ml-2 hover:text-foreground" on:click={() => { locationId = null; selectedVenueLabel = ''; }}>change</button>
      </p>
    {:else if locationId}
      <p class="text-sm text-muted-foreground">Venue ID: {locationId}</p>
    {:else}
      <p class="text-sm text-muted-foreground">No venue selected — use the finder below.</p>
    {/if}
    {#if !locationId && startTime && endTime}
      <VenueRecommender {startTime} {endTime} on:select={handleVenueSelect} />
    {:else if !locationId}
      <p class="text-xs text-muted-foreground">Enter start and end times to see venue recommendations.</p>
    {/if}
  </div>

  <!-- Private toggle -->
  <div class="flex items-center gap-2">
    <input
      id="isPrivate"
      type="checkbox"
      bind:checked={isPrivate}
      class="rounded border-gray-300 text-primary focus:ring-primary"
    />
    <Label htmlFor="isPrivate" class="cursor-pointer font-normal">Private event (members only)</Label>
  </div>

  <!-- Submit -->
  <div class="flex gap-3 pt-2">
    <Button type="submit" disabled={!canSubmit || loading}>
      {#if loading}
        {isEditMode ? 'Saving…' : 'Creating…'}
      {:else}
        {isEditMode ? 'Update event' : 'Create event'}
      {/if}
    </Button>
    <Button type="button" variant="ghost" on:click={() => dispatch('cancel')}>
      Cancel
    </Button>
  </div>
</form>
