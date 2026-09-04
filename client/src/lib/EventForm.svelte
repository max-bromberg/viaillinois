<script>
  import { createEventDispatcher } from 'svelte';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Button } from '$lib/components/ui/button';
  import LocationPicker from './LocationPicker.svelte';
  import DatePicker from './DatePicker.svelte';
  import { toDateTimeLocal } from './campusTime.js';
  import { recurrenceLabel, repeatSummary } from './recurrenceLabel.js';

  export let rsoId;
  export let initial = {};
  export let loading = false;
  /**
   * The term, from GET /api/v1/semester/current. A repeat runs to the end of
   * instruction unless the organizer says otherwise, and the date it arrives at
   * is shown rather than assumed, so it can be corrected.
   */
  export let semester = null;
  /**
   * A repeat this form starts with, from a scheduler recommendation that was
   * searched for as a repeat. The organizer can still change it.
   */
  export let initialRecurrence = null;

  const dispatch = createEventDispatcher();

  const ALL_TAGS = ['Free Food', 'Workshop', 'Social', 'Corporate', 'Competition', 'Weekly Meeting', 'Speaker', 'Networking'];

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const REPEATS = [
    { value: 'none',     label: 'Does not repeat' },
    { value: 'weekly',   label: 'Every week' },
    { value: 'biweekly', label: 'Every other week' },
  ];

  let title       = initial.title       || '';
  let description = initial.description || '';
  // The form is filled with the hour the organizer typed. Reading the published
  // instant in the browser's own zone instead would move the event by that
  // zone's offset the moment an untouched form was saved.
  let startTime   = toDateTimeLocal(initial.start_time);
  let endTime     = toDateTimeLocal(initial.end_time);
  let locationId   = initial.location_id   || null;
  let locationText = initial.location_text || null;
  let locationNote = initial.location_note || '';
  let isPrivate   = initial.is_private  || false;
  let selectedTags = initial.tags ? initial.tags.split(',').filter(Boolean) : [];

  let repeat = initialRecurrence
    ? (Number(initialRecurrence.interval_weeks) === 2 ? 'biweekly' : 'weekly')
    : 'none';
  let repeatDays = initialRecurrence?.days_of_week ?? [];
  let repeatUntil = initialRecurrence?.ends_on ?? '';

  // The day the form is set to, read from its calendar fields rather than as an
  // instant, so a reader in another zone is offered the day they picked.
  $: startDay = /^\d{4}-\d{2}-\d{2}/.test(startTime)
    ? WEEKDAYS[new Date(`${startTime.slice(0, 10)}T12:00:00`).getDay()]
    : null;

  $: recurrence = repeat === 'none' ? null : {
    interval_weeks: repeat === 'biweekly' ? 2 : 1,
    days_of_week: repeatDays,
    ends_on: repeatUntil || undefined,
  };
  $: repeatSentence = repeatSummary(recurrence && repeatUntil ? { ...recurrence, ends_on: repeatUntil } : recurrence);
  $: seriesSentence = recurrenceLabel(initial);

  function chooseRepeat(value) {
    repeat = value;
    if (value === 'none') return;
    if (repeatDays.length === 0 && startDay) repeatDays = [startDay];
    if (!repeatUntil) repeatUntil = semester?.instruction_end ?? '';
  }

  function toggleDay(day) {
    repeatDays = repeatDays.includes(day)
      ? repeatDays.filter(d => d !== day)
      : WEEKDAYS.filter(d => d === day || repeatDays.includes(d));
  }

  // What to show for a location the event already has. A room is described by
  // the columns the listing queries return; free text is itself.
  const initialLocationLabel = initial.building
    ? `${initial.building} ${initial.room_number ?? ''}`.trim()
    : (initial.location_text || '');

  $: isEditMode = !!initial.event_id;
  // A repeat is set up when the event is created. Changing the rule afterwards
  // is deleting the series and making it again, which is two clicks and no
  // question about what happens to the weeks that already moved.
  $: canRepeat = !isEditMode;
  // A location is not required. Plenty of events are somewhere VIA has no room
  // record for, and plenty more do not have one settled when they are created.
  $: canSubmit = title && startTime && endTime && endTime > startTime
    && (repeat === 'none' || repeatDays.length > 0);

  function toggleTag(tag) {
    selectedTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
  }

  function handleLocationChange({ location_id, location_text }) {
    locationId = location_id;
    locationText = location_text;
  }

  function submit() {
    if (!canSubmit) return;
    dispatch('submit', {
      rso_id: rsoId, title, description,
      start_time: startTime, end_time: endTime,
      location_id: locationId, location_text: locationText,
      location_note: locationNote.trim() || null,
      is_private: isPrivate,
      tags: selectedTags,
      recurrence: canRepeat ? recurrence : null,
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

  <!-- Repeat -->
  {#if canRepeat}
    <div class="space-y-2">
      <Label>Repeat</Label>
      <div class="flex flex-wrap gap-2">
        {#each REPEATS as option}
          <button
            type="button"
            aria-pressed={repeat === option.value}
            class="text-xs px-3 py-1 rounded-full border transition-colors
              {repeat === option.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-accent'}"
            on:click={() => chooseRepeat(option.value)}
          >
            {option.label}
          </button>
        {/each}
      </div>

      {#if repeat !== 'none'}
        <div class="rounded-md border p-3 space-y-3 bg-muted/30">
          <div class="space-y-1">
            <Label>On these days</Label>
            <div class="flex flex-wrap gap-1.5">
              {#each WEEKDAYS as day}
                <button
                  type="button"
                  aria-pressed={repeatDays.includes(day)}
                  class="text-xs w-11 py-1 rounded border transition-colors
                    {repeatDays.includes(day)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-accent'}"
                  on:click={() => toggleDay(day)}
                >{day}</button>
              {/each}
            </div>
          </div>

          <div class="space-y-1">
            <Label htmlFor="repeatUntil">Until</Label>
            <DatePicker bind:value={repeatUntil} placeholder="Last date" min={startTime.slice(0, 10)} />
            {#if semester}
              <p class="text-xs text-muted-foreground">
                {semester.label} instruction ends on {semester.instruction_end}. Weeks with no classes are left out.
              </p>
            {/if}
          </div>

          {#if repeatSentence}
            <p class="text-xs font-medium">{repeatSentence}</p>
          {/if}
        </div>
      {/if}
    </div>
  {:else if seriesSentence}
    <div class="space-y-1">
      <Label>Repeat</Label>
      <p class="text-sm text-muted-foreground">{seriesSentence}</p>
    </div>
  {/if}

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

  <!-- Location -->
  <LocationPicker initialLabel={initialLocationLabel} onChange={handleLocationChange} />

  <!-- Location note: the small thing that changes at the door, kept apart from the room itself -->
  <div class="space-y-1.5">
    <Label htmlFor="locationNote">Location note</Label>
    <Input
      id="locationNote"
      bind:value={locationNote}
      maxlength="500"
      placeholder="Use the north entrance, or ask at the front desk."
    />
    <p class="text-xs text-muted-foreground">Shown beside the room on the event page and in Discord.</p>
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
