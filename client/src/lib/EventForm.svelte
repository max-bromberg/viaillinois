<script>
  import { tagNames } from './tagList.js';
  import { createEventDispatcher } from 'svelte';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Button } from '$lib/components/ui/button';
  import LocationPicker from './LocationPicker.svelte';
  import DatePicker from './DatePicker.svelte';
  import MultiDatePicker from './MultiDatePicker.svelte';
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

  // The list the platform keeps, which an admin adds to and takes from.
  const ALL_TAGS = tagNames;

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  /**
   * The shapes a repeat can take.
   *
   * Every week and every other week are the same weekly rule with a different
   * interval, and both are here because those two are what most of what an RSO
   * holds actually is. The interval itself can be changed in the panel below,
   * which is what makes every third week possible without a fourth button.
   */
  const REPEATS = [
    { value: 'none',     label: 'Does not repeat', interval: null },
    { value: 'weekly',   label: 'Every week',      interval: 1 },
    { value: 'weekly',   label: 'Every other week', interval: 2 },
    { value: 'monthly',  label: 'Every month',     interval: null },
    { value: 'dates',    label: 'On dates I pick', interval: null },
  ];

  /** Which of the two things a monthly rule can mean. */
  const MONTHLY_SHAPES = [
    { value: 'day',     label: 'On a date of the month' },
    { value: 'weekday', label: 'On a weekday of the month' },
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

  let repeat = initialRecurrence ? 'weekly' : 'none';
  let repeatDays = initialRecurrence?.days_of_week ?? [];
  let repeatUntil = initialRecurrence?.ends_on ?? '';
  let intervalWeeks = Number(initialRecurrence?.interval_weeks ?? 1);
  let intervalMonths = 1;
  let monthlyShape = 'day';
  let monthDay = null;
  let monthWeek = null;
  /** The dates chosen one by one, for a repeat that follows no rule. */
  let pickedDates = [];

  // The day the form is set to, read from its calendar fields rather than as an
  // instant, so a reader in another zone is offered the day they picked.
  $: startDay = /^\d{4}-\d{2}-\d{2}/.test(startTime)
    ? WEEKDAYS[new Date(`${startTime.slice(0, 10)}T12:00:00`).getDay()]
    : null;

  /** The month the date picker opens on, which is the month the event is in. */
  $: pickerMonth = /^\d{4}-\d{2}/.test(startTime) ? startTime.slice(0, 7) : undefined;

  /**
   * The rule as the API takes it.
   *
   * A monthly rule carries either a date in the month or a weekday of it, and
   * never both, because the fifteenth and the second Tuesday are different
   * dates in every month and a rule holding both says nothing about which was
   * meant.
   */
  $: recurrence = repeat === 'none' ? null
    : repeat === 'dates'
      ? { frequency: 'dates', dates: pickedDates }
    : repeat === 'monthly'
      ? {
          frequency: 'monthly',
          interval_months: Number(intervalMonths) || 1,
          ends_on: repeatUntil || undefined,
          ...(monthlyShape === 'day'
            ? { month_day: monthDay }
            : { month_week: monthWeek, days_of_week: repeatDays.slice(0, 1) }),
        }
      : {
          frequency: 'weekly',
          interval_weeks: Number(intervalWeeks) || 1,
          days_of_week: repeatDays,
          ends_on: repeatUntil || undefined,
        };
  $: repeatSentence = repeatSummary(recurrence);
  $: seriesSentence = recurrenceLabel(initial);

  function chooseRepeat(value, interval) {
    repeat = value;
    if (value === 'none') return;
    if (value === 'weekly' && interval !== null) intervalWeeks = interval;
    if (repeatDays.length === 0 && startDay) repeatDays = [startDay];
    // The dates a person picks are the whole rule, so there is nothing to run
    // until.
    if (value !== 'dates' && !repeatUntil) repeatUntil = semester?.instruction_end ?? '';
    if (value === 'monthly') fillMonthlyFromStart();
  }

  /**
   * A monthly rule starts out saying what the date already on the form says: if
   * the event is on the fifteenth, once a month means the fifteenth, and if it
   * is on the second Tuesday, that is what the other shape means.
   */
  function fillMonthlyFromStart() {
    const day = /^\d{4}-\d{2}-\d{2}/.test(startTime) ? Number(startTime.slice(8, 10)) : null;
    if (day === null) return;
    if (monthDay === null) monthDay = day;
    if (monthWeek === null) monthWeek = Math.ceil(day / 7);
    if (repeatDays.length === 0 && startDay) repeatDays = [startDay];
  }

  /** Whether a repeat shape button is the one currently chosen. */
  const isChosen = (option) =>
    option.value === repeat
    && (option.value !== 'weekly' || Number(intervalWeeks) === option.interval);

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
    && (repeat === 'none'
        || (repeat === 'dates' && pickedDates.length > 0)
        || (repeat === 'monthly' && (monthlyShape === 'day' ? monthDay !== null : repeatDays.length > 0))
        || (repeat === 'weekly' && repeatDays.length > 0));

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
            aria-pressed={isChosen(option)}
            class="text-xs px-3 py-1 rounded-full border transition-colors
              {isChosen(option)
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-accent'}"
            on:click={() => chooseRepeat(option.value, option.interval)}
          >
            {option.label}
          </button>
        {/each}
      </div>

      {#if repeat !== 'none'}
        <div class="rounded-md border p-3 space-y-3 bg-muted/30">

          {#if repeat === 'weekly'}
            <div class="space-y-1">
              <Label htmlFor="intervalWeeks">Repeat every how many weeks</Label>
              <Input id="intervalWeeks" type="number" min="1" max="8" bind:value={intervalWeeks} class="w-24" />
            </div>
          {/if}

          {#if repeat === 'monthly'}
            <div class="space-y-1">
              <Label>What once a month means</Label>
              <div class="flex flex-wrap gap-2">
                {#each MONTHLY_SHAPES as shape}
                  <button
                    type="button"
                    aria-pressed={monthlyShape === shape.value}
                    class="text-xs px-3 py-1 rounded-full border transition-colors
                      {monthlyShape === shape.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-accent'}"
                    on:click={() => monthlyShape = shape.value}
                  >{shape.label}</button>
                {/each}
              </div>
            </div>

            <div class="flex flex-wrap gap-4">
              <div class="space-y-1">
                <Label htmlFor="intervalMonths">Repeat every how many months</Label>
                <Input id="intervalMonths" type="number" min="1" max="12" bind:value={intervalMonths} class="w-24" />
              </div>
              {#if monthlyShape === 'day'}
                <div class="space-y-1">
                  <Label htmlFor="monthDay">Which date of the month</Label>
                  <Input id="monthDay" type="number" min="1" max="31" bind:value={monthDay} class="w-24" />
                </div>
              {:else}
                <div class="space-y-1">
                  <Label htmlFor="monthWeek">Which one in the month</Label>
                  <select id="monthWeek" bind:value={monthWeek} class="border rounded-md px-3 py-2 text-sm bg-background">
                    <option value={1}>First</option>
                    <option value={2}>Second</option>
                    <option value={3}>Third</option>
                    <option value={4}>Fourth</option>
                    <option value={5}>Fifth</option>
                    <option value={-1}>Last</option>
                  </select>
                </div>
              {/if}
            </div>
            {#if monthlyShape === 'day'}
              <p class="text-xs text-muted-foreground">
                A month that has no such date is left out rather than moved to the next one.
              </p>
            {/if}
          {/if}

          {#if repeat === 'dates'}
            <div class="space-y-1">
              <Label>Pick the dates</Label>
              <MultiDatePicker
                bind:value={pickedDates}
                month={pickerMonth}
                min={startTime.slice(0, 10)}
              />
              <p class="text-xs text-muted-foreground">
                Each date takes the hour and the length above. Nothing is left out, because
                these are the dates you chose rather than dates a rule produced.
              </p>
            </div>
          {:else if repeat === 'weekly' || monthlyShape === 'weekday'}
            <div class="space-y-1">
              <Label>{repeat === 'monthly' ? 'On this day' : 'On these days'}</Label>
              <div class="flex flex-wrap gap-1.5">
                {#each WEEKDAYS as day}
                  <button
                    type="button"
                    aria-pressed={repeatDays.includes(day)}
                    class="text-xs w-11 py-1 rounded border transition-colors
                      {repeatDays.includes(day)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-accent'}"
                    on:click={() => repeat === 'monthly' ? repeatDays = [day] : toggleDay(day)}
                  >{day}</button>
                {/each}
              </div>
            </div>
          {/if}

          {#if repeat !== 'dates'}
            <div class="space-y-1">
              <Label htmlFor="repeatUntil">Until</Label>
              <DatePicker bind:value={repeatUntil} placeholder="Last date" min={startTime.slice(0, 10)} />
              {#if semester}
                <p class="text-xs text-muted-foreground">
                  {semester.label} instruction ends on {semester.instruction_end}. Weeks with no classes are left out.
                </p>
              {/if}
            </div>
          {/if}

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
      {#each $ALL_TAGS as tag}
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
