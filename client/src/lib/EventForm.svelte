<script>
  import { tagNames } from './tagList.js';
  import { tagHue } from './tagHue.js';
  import { createEventDispatcher } from 'svelte';
  import { Button, Field, Switch, Pad, Highlight } from './components/ui/index.js';
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
  let isPrivate   = !!initial.is_private;
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
   * The three numbers the repeat panel collects, as numbers.
   *
   * The field draws its input with the type it was given rather than with a
   * fixed one, so what comes back out of it is the text that was typed. A rule
   * carrying "15" where the API expects 15 is a rule the platform reads as a
   * missing date, so the reading happens once, here.
   */
  const asNumber = value =>
    value === null || value === undefined || value === '' ? null : Number(value);

  $: monthDayNumber = asNumber(monthDay);

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
          interval_months: asNumber(intervalMonths) || 1,
          ends_on: repeatUntil || undefined,
          ...(monthlyShape === 'day'
            ? { month_day: monthDayNumber }
            : { month_week: monthWeek, days_of_week: repeatDays.slice(0, 1) }),
        }
      : {
          frequency: 'weekly',
          interval_weeks: asNumber(intervalWeeks) || 1,
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
    if (monthDayNumber === null) monthDay = day;
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
        || (repeat === 'monthly' && (monthlyShape === 'day' ? monthDayNumber !== null : repeatDays.length > 0))
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

<form on:submit|preventDefault={submit} class="form">
  <Field
    label="Event title"
    id="title"
    bind:value={title}
    required
    placeholder="IEEE weekly meeting"
    class="wide"
  />

  <div class="fld wide">
    <label for="description">Description</label>
    <div class="in">
      <Pad />
      <textarea
        id="description"
        bind:value={description}
        rows="3"
        placeholder="What happens at this event, in a sentence or two."
      ></textarea>
    </div>
  </div>

  <div class="pair">
    <Field label="Start time" id="startTime" type="datetime-local" bind:value={startTime} required />
    <Field label="End time" id="endTime" type="datetime-local" bind:value={endTime} required />
  </div>

  {#if canRepeat}
    <fieldset class="group">
      <legend>Repeat</legend>
      <div class="choices">
        {#each REPEATS as option}
          <button
            type="button"
            class="check"
            aria-pressed={isChosen(option)}
            on:click={() => chooseRepeat(option.value, option.interval)}
          >
            <Pad hollow={!isChosen(option)} />
            <span>{option.label}</span>
          </button>
        {/each}
      </div>

      {#if repeat !== 'none'}
        <div class="panel cut" style="--cut: 14px">

          {#if repeat === 'weekly'}
            <Field
              label="Repeat every how many weeks"
              id="intervalWeeks"
              type="number"
              min="1"
              max="8"
              bind:value={intervalWeeks}
              class="narrow"
            />
          {/if}

          {#if repeat === 'monthly'}
            <fieldset class="group">
              <legend>What once a month means</legend>
              <div class="choices">
                {#each MONTHLY_SHAPES as shape}
                  <button
                    type="button"
                    class="check"
                    aria-pressed={monthlyShape === shape.value}
                    on:click={() => monthlyShape = shape.value}
                  >
                    <Pad hollow={monthlyShape !== shape.value} />
                    <span>{shape.label}</span>
                  </button>
                {/each}
              </div>
            </fieldset>

            <div class="pair">
              <Field
                label="Repeat every how many months"
                id="intervalMonths"
                type="number"
                min="1"
                max="12"
                bind:value={intervalMonths}
                class="narrow"
              />
              {#if monthlyShape === 'day'}
                <Field
                  label="Which date of the month"
                  id="monthDay"
                  type="number"
                  min="1"
                  max="31"
                  bind:value={monthDay}
                  class="narrow"
                  help="A month that has no such date is left out rather than moved to the next one."
                />
              {:else}
                <div class="fld narrow">
                  <label for="monthWeek">Which one in the month</label>
                  <div class="in">
                    <Pad />
                    <select id="monthWeek" bind:value={monthWeek} style="background: var(--card)">
                      <option value={1}>First</option>
                      <option value={2}>Second</option>
                      <option value={3}>Third</option>
                      <option value={4}>Fourth</option>
                      <option value={5}>Fifth</option>
                      <option value={-1}>Last</option>
                    </select>
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          {#if repeat === 'dates'}
            <fieldset class="group">
              <legend>Pick the dates</legend>
              <MultiDatePicker
                bind:value={pickedDates}
                month={pickerMonth}
                min={startTime.slice(0, 10)}
              />
              <p class="note">
                Each date takes the hour and the length above. Nothing is left out, because
                these are the dates you chose rather than dates a rule produced.
              </p>
            </fieldset>
          {:else if repeat === 'weekly' || monthlyShape === 'weekday'}
            <fieldset class="group">
              <legend>{repeat === 'monthly' ? 'On this day' : 'On these days'}</legend>
              <div class="choices days">
                {#each WEEKDAYS as day}
                  <button
                    type="button"
                    class="check"
                    aria-pressed={repeatDays.includes(day)}
                    on:click={() => repeat === 'monthly' ? repeatDays = [day] : toggleDay(day)}
                  >
                    <Pad hollow={!repeatDays.includes(day)} />
                    <span>{day}</span>
                  </button>
                {/each}
              </div>
            </fieldset>
          {/if}

          {#if repeat !== 'dates'}
            <div class="group">
              <span class="name" id="repeat-until">Until</span>
              <DatePicker
                bind:value={repeatUntil}
                label="Until"
                describedBy="repeat-until"
                placeholder="Last date"
                min={startTime.slice(0, 10)}
              />
              {#if semester}
                <p class="help">
                  {semester.label} instruction ends on {semester.instruction_end}. Weeks with no classes are left out.
                </p>
              {/if}
            </div>
          {/if}

          {#if repeatSentence}
            <p class="says">{repeatSentence}</p>
          {/if}
        </div>
      {/if}
    </fieldset>
  {:else if seriesSentence}
    <div class="told">
      <span class="name">Repeat</span>
      <p>{seriesSentence}</p>
    </div>
  {/if}

  <fieldset class="group">
    <legend>Tags</legend>
    <div class="hlrow">
      {#each $ALL_TAGS as tag}
        <Highlight
          tone={tagHue(tag)}
          off={!selectedTags.includes(tag)}
          pressed={selectedTags.includes(tag)}
          onclick={() => toggleTag(tag)}
        >{tag}</Highlight>
      {/each}
    </div>
  </fieldset>

  <LocationPicker initialLabel={initialLocationLabel} onChange={handleLocationChange} />

  <!-- The small thing that changes at the door, kept apart from the room itself. -->
  <Field
    label="Location note"
    id="locationNote"
    bind:value={locationNote}
    maxlength="500"
    placeholder="Use the north entrance, or ask at the front desk."
    help="Shown beside the room on the event page and in Discord."
    class="wide"
  />

  <div class="private">
    <Switch label="Members only" bind:checked={isPrivate} />
    <span class="name">Members only</span>
    <p class="help">
      A members only event is shown to the organization and is kept off the public feed.
    </p>
  </div>

  <div class="actions">
    <Button type="submit" variant="primary" disabled={!canSubmit || loading}>
      {#if loading}
        {isEditMode ? 'Saving…' : 'Creating…'}
      {:else}
        {isEditMode ? 'Update event' : 'Create event'}
      {/if}
    </Button>
    <Button type="button" variant="quiet" onclick={() => dispatch('cancel')}>
      Close without saving
    </Button>
  </div>
</form>

<style>
  .form {
    display: grid;
    gap: 22px;
  }

  /*
   * A field holds itself to 320 px, which is right for a time and wrong for a
   * title, so the two that carry a sentence are told they may run wider.
   */
  .form :global(.fld.wide) {
    max-width: 560px;
  }

  .form :global(.fld.narrow) {
    max-width: 190px;
  }

  /* Two fields side by side, and one under the other when there is no room. */
  .pair {
    display: flex;
    flex-wrap: wrap;
    gap: 18px 26px;
  }

  /*
   * A group of controls is a fieldset, so that the name of the group reaches a
   * screen reader as the name of the group rather than as a line of text above
   * it. The browser's own box and inset are taken off.
   */
  .group {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }

  .group legend,
  .name {
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 700;
    font-size: 14px;
    padding: 0;
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 20px;
  }

  .choices .check {
    font: inherit;
    font-size: 14.5px;
    background: none;
    border: 0;
    padding: 0;
    gap: 10px;
    color: var(--ink);
  }

  .choices .check[aria-pressed="true"] span {
    font-weight: 600;
  }

  .choices .check[aria-pressed="false"] span {
    color: var(--muted);
  }

  /* The seven days read as a row of equal words rather than as a sentence. */
  .days .check span {
    min-width: 28px;
  }

  /*
   * The repeat panel is the one container on the form, and it is the well
   * colour cut at fourteen pixels, the way the board's panel is drawn on the
   * event page. It is not a rounded rectangle with a hairline around it.
   */
  .panel {
    background: var(--well);
    padding: 18px 20px;
    display: grid;
    gap: 18px;
  }

  .note,
  .help {
    font-size: 12.5px;
    color: var(--muted);
    max-width: 52ch;
  }

  .says {
    font-family: var(--display);
    font-stretch: 90%;
    font-weight: 700;
    font-size: 14px;
  }

  .told {
    display: grid;
    gap: 4px;
  }

  .told p {
    font-size: 14px;
    color: var(--muted);
  }

  /* A textarea takes the same line the field's input takes. */
  .fld .in textarea {
    font: inherit;
    font-size: 16px;
    border: 0;
    background: transparent;
    color: var(--ink);
    outline: 0;
    width: 100%;
    resize: vertical;
  }

  .fld .in select {
    font: inherit;
    font-size: 16px;
    border: 0;
    color: var(--ink);
    outline: 0;
    width: 100%;
    padding: 2px 0;
  }

  .private {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 6px 12px;
  }

  .private .help {
    grid-column: 2;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 18px;
    padding-top: 4px;
  }

  /*
   * A field written out here rather than taken from the Field component still
   * has to carry the state on its line, so the rule and the pad turn primary
   * when whatever sits between them has the focus.
   */
  .fld .in:focus-within {
    border-color: var(--primary);
    box-shadow: 0 2px 0 0 var(--primary);
  }

  .fld .in:focus-within :global(.pad) {
    --h: var(--primary);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 22%, transparent);
  }
</style>
