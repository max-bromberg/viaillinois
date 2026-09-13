<script>
  import { onMount } from 'svelte';
  import { campusDateTime, campusTime, campusToday } from '../lib/campusTime.js';
  import { currentUser, adminRsoIds } from '../stores/auth.js';
  import { navigate } from '../lib/router.js';
  import { recommend } from '../api/scheduler.js';
  import { getCourses } from '../api/midterms.js';
  import { createEvent, createEventSeries } from '../api/events.js';
  import { getCurrentSemester } from '../api/semester.js';
  import { repeatSummary } from '../lib/recurrenceLabel.js';
  import { showToast } from '../stores/ui.js';
  import EventForm from '../lib/EventForm.svelte';
  import DayTierPicker from '../lib/DayTierPicker.svelte';
  import SchedulerInsightCard from '../lib/SchedulerInsightCard.svelte';
  import DatePicker from '../lib/DatePicker.svelte';
  import { searchLocations } from '../api/locations.js';
  import { resolvedTheme } from '../stores/theme.js';
  import { organizationColor } from '../lib/organizationColor.js';
  import { Button, Field, Pad, Highlight, Switch, EmptyState } from '../lib/components/ui/index.js';

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

  // ── Repeat ───────────────────────────────────────────────────────────────
  // The question a board usually has is which evening works for the term, not
  // which evening works next week.
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const REPEATS = [
    { value: 'none',     label: 'Does not repeat' },
    { value: 'weekly',   label: 'Every week' },
    { value: 'biweekly', label: 'Every other week' },
  ];
  let repeat = 'none';
  let repeatDays = [];
  let repeatUntil = '';
  let semester = null;

  $: recurrence = repeat === 'none' ? null : {
    intervalWeeks: repeat === 'biweekly' ? 2 : 1,
    daysOfWeek: repeatDays,
    until: repeatUntil || semester?.instruction_end || endDate,
  };
  $: repeatSentence = repeatSummary(recurrence && {
    interval_weeks: recurrence.intervalWeeks,
    days_of_week: recurrence.daysOfWeek,
    ends_on: recurrence.until,
  });

  function chooseRepeat(value) {
    repeat = value;
    if (value !== 'none' && !repeatUntil) repeatUntil = semester?.instruction_end ?? '';
  }

  function toggleRepeatDay(day) {
    repeatDays = repeatDays.includes(day)
      ? repeatDays.filter(d => d !== day)
      : WEEKDAYS.filter(d => d === day || repeatDays.includes(d));
  }

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
  const TIER_LABELS = { required: 'Required', strongly_preferred: 'Strongly preferred', nice_to_have: 'Nice to have' };
  const SENSITIVITY_LABELS = {
    low: 'Keep a day and a half clear',
    medium: 'Keep three days clear',
    high: 'Keep five days clear',
  };
  /** How long an event runs, in the words a board would use for it. */
  const DURATIONS = [
    { value: 30,  label: '30 minutes' },
    { value: 60,  label: '1 hour' },
    { value: 90,  label: '1 hour and a half' },
    { value: 120, label: '2 hours' },
    { value: 180, label: '3 hours' },
  ];

  onMount(async () => {
    try {
      // A repeat searched for here runs to the end of instruction unless the
      // board says otherwise, and the date is shown so it can be corrected.
      ({ semester } = await getCurrentSemester());
      // The question is almost always about the rest of the term, so that is
      // the range the search starts with. Both dates are shown and editable.
      if (!startDate) startDate = campusToday();
      if (!endDate) endDate = semester.instruction_end;
    } catch {
      semester = null;
    }
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
    if (!startDate || !endDate) { showToast('The scheduler needs a first date and a last date.', 'error'); return; }
    if (new Date(startDate) >= new Date(endDate)) { showToast('The first date has to come before the last date.', 'error'); return; }

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
        recurrence,
      });
      if (!recommendations.curatedPicks.length && !recommendations.allOptions.length) {
        showToast('Nothing is free inside those constraints. Make a required constraint a preference and look again.', 'error');
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
      if (e.detail.recurrence) {
        const { created, skipped } = await createEventSeries(e.detail);
        showToast(
          skipped?.length
            ? `Scheduled ${created} events. These weeks were left out because the room was taken: ${skipped.join(', ')}.`
            : `Scheduled ${created} events.`,
          skipped?.length ? 'error' : undefined
        );
      } else {
        await createEvent(e.detail);
        showToast('The event is on the feed.');
      }
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
    return campusDateTime(iso);
  }

  /**
   * The organization's light, bent into the site's range for the theme the page
   * is in. Every recommendation is lit by it, which is how a row says whose
   * event it would be.
   */
  $: recommendationTone = organizationColor(selectedRso?.logo_color, 'lamp', $resolvedTheme);

  /**
   * What the scheduler has been told to look for, written as sentences.
   *
   * The review step used to be a grid of "Duration:", "Dates:", "Buildings:"
   * and a value beside each, which is the one thing docs/design/10-voice.md
   * says the site never does.
   */
  $: reviewLines = [
    `The event runs for ${durationMinutes} minutes.`,
    startDate && endDate
      ? `It is looked for between ${startDate} and ${endDate}.`
      : 'It is looked for on any date.',
    enableTimeConstraint
      ? `The hours ${timeStartHour}:00 to ${timeEndHour}:00 are ${TIER_LABELS[timeTier].toLowerCase()}.`
      : 'Any hour of the day will do.',
    repeat === 'none'
      ? 'It happens once.'
      : (repeatSentence ? `${repeatSentence}.` : 'It repeats.'),
    dayConstraints.length > 0
      ? `The days it may fall on are ${dayConstraints.map(d => `${d.day}, which is ${TIER_LABELS[d.tier]?.toLowerCase() ?? d.tier.replace(/_/g, ' ')}`).join(', ')}.`
      : 'Any day of the week will do.',
    buildingConstraints.length > 0
      ? `The buildings it may be in are ${buildingConstraints.map(b => `${b.building}, which is ${TIER_LABELS[b.tier].toLowerCase()}`).join(', ')}.`
      : 'Any building will do.',
    excludedRooms.length > 0
      ? `These rooms are left out: ${excludedRooms.map(r => `${r.building} ${r.room_number}`).join(', ')}.`
      : 'No room is left out.',
    targetCourses.length > 0
      ? `It is meant for people taking ${targetCourses.join(', ')}, and the search keeps clear of their exams. ${SENSITIVITY_LABELS[midtermSensitivity]}.`
      : 'No course was named, so no exam is worked around.',
  ];
</script>

<svelte:head><title>The scheduler: VIA</title></svelte:head>

<div class="sched">

  <div class="head">
    <h1 class="title">The scheduler</h1>
    <p class="about">
      The scheduler weighs which rooms are free, what else is on, when classes meet and how
      close the exams are, and gives back the times that work best for the people you want
      in the room.
    </p>
  </div>

  {#if showEventForm && selectedRec}
    <!-- ── The event, from the time that was chosen ────────────────────── -->
    <div class="tabbody">
      <div class="panelhead">
        <h2>File this event</h2>
        <Button variant="quiet" size="sm" icon="back" onclick={() => showEventForm = false}>
          Back to the times
        </Button>
      </div>

      <p class="chosen">
        <span class="when">{fmtDateTime(selectedRec.start)} to {fmtTime(selectedRec.end)}</span>
        <span class="where mono">
          {selectedRec.location?.building} {selectedRec.location?.room_number}, seats {selectedRec.location?.max_capacity}
        </span>
      </p>

      <EventForm
        rsoId={selectedRso?.rso_id}
        initial={{
          start_time: selectedRec.start, end_time: selectedRec.end,
          location_id: selectedRec.location?.location_id,
          building: selectedRec.location?.building,
          room_number: selectedRec.location?.room_number,
        }}
        initialRecurrence={selectedRec.recurrence ? {
          interval_weeks: selectedRec.recurrence.interval_weeks,
          days_of_week: selectedRec.recurrence.days_of_week,
          ends_on: selectedRec.recurrence.until,
        } : null}
        {semester}
        {loading}
        on:submit={handleCreateEvent}
        on:cancel={() => showEventForm = false}
      />
    </div>

  {:else}
    {#if schedulableRsos.length > 1}
      <div class="switcher">
        {#each schedulableRsos as rso}
          <button
            type="button"
            class="check"
            aria-pressed={selectedRso?.rso_id === rso.rso_id}
            on:click={() => { selectedRso = rso; recommendations = null; }}
          >
            <Pad
              tone={organizationColor(rso.logo_color, 'mark', $resolvedTheme)}
              hollow={selectedRso?.rso_id !== rso.rso_id}
            />
            <span>{rso.name}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if selectedRso}
      <div class="tabs">
        <button type="button" class="tab" aria-pressed={inputMode === 'wizard'}
          on:click={() => inputMode = 'wizard'}>One step at a time</button>
        <button type="button" class="tab" aria-pressed={inputMode === 'advanced'}
          on:click={() => inputMode = 'advanced'}>Everything at once</button>
      </div>

      {#if inputMode === 'wizard'}
        <!-- ── One step at a time ───────────────────────────────────────── -->
        <p class="progress">
          {#each [1, 2, 3, 4, 5] as s}
            <Pad hollow={s > wizardStep} />
          {/each}
          <span>Step {wizardStep} of 5</span>
        </p>

        <div class="panel cut" style="--cut: 14px">

          {#if wizardStep === 1}
            <h2>The event itself</h2>
            <div class="fld">
              <label for="w-duration">How long it runs</label>
              <div class="in">
                <Pad />
                <select id="w-duration" bind:value={durationMinutes} style="background: var(--well)">
                  {#each DURATIONS as option}<option value={option.value}>{option.label}</option>{/each}
                </select>
              </div>
            </div>

          {:else if wizardStep === 2}
            <h2>When it could be</h2>

            <fieldset class="group">
              <legend>The dates to look between</legend>
              <div class="pair">
                <DatePicker bind:value={startDate} label="The first date" placeholder="First date" />
                <DatePicker bind:value={endDate} label="The last date" placeholder="Last date" min={startDate} />
              </div>
            </fieldset>

            <fieldset class="group">
              <legend>Repeat</legend>
              <div class="choices">
                {#each REPEATS as option}
                  <button
                    type="button" class="check" aria-pressed={repeat === option.value}
                    on:click={() => chooseRepeat(option.value)}
                  >
                    <Pad hollow={repeat !== option.value} />
                    <span>{option.label}</span>
                  </button>
                {/each}
              </div>

              {#if repeat !== 'none'}
                <div class="inner">
                  <fieldset class="group">
                    <legend>On these days, or any day if none are chosen</legend>
                    <div class="choices">
                      {#each WEEKDAYS as day}
                        <button
                          type="button" class="check" aria-pressed={repeatDays.includes(day)}
                          on:click={() => toggleRepeatDay(day)}
                        >
                          <Pad hollow={!repeatDays.includes(day)} />
                          <span>{day}</span>
                        </button>
                      {/each}
                    </div>
                  </fieldset>

                  <div class="group">
                    <span class="name" id="wizard-until">Until</span>
                    <DatePicker
                      bind:value={repeatUntil} label="Until" describedBy="wizard-until"
                      placeholder="Last date" min={startDate}
                    />
                    {#if semester}
                      <p class="help">{semester.label} instruction ends on {semester.instruction_end}.</p>
                    {/if}
                  </div>

                  {#if repeatSentence}<p class="says">{repeatSentence}</p>{/if}
                </div>
              {/if}
            </fieldset>

            <fieldset class="group">
              <legend>How much each day of the week matters</legend>
              <DayTierPicker value={dayConstraints} on:change={e => dayConstraints = e.detail} />
            </fieldset>

            <fieldset class="group">
              <legend>The hours of the day</legend>
              <div class="setting">
                <Switch label="Hold the search to a window of the day" bind:checked={enableTimeConstraint} />
                <span>Hold the search to a window of the day</span>
              </div>
              {#if enableTimeConstraint}
                <div class="window">
                  <Field label="From this hour" id="w-time-start" type="number" min="0" max="23"
                    bind:value={timeStartHour} class="hour" />
                  <Field label="To this hour" id="w-time-end" type="number" min="0" max="23"
                    bind:value={timeEndHour} class="hour" />
                  <div class="fld">
                    <label for="w-time-tier">How much that matters</label>
                    <div class="in">
                      <Pad />
                      <select id="w-time-tier" bind:value={timeTier} style="background: var(--well)">
                        {#each TIERS as t}<option value={t}>{TIER_LABELS[t]}</option>{/each}
                      </select>
                    </div>
                  </div>
                </div>
              {/if}
            </fieldset>

          {:else if wizardStep === 3}
            <h2>Who it is for</h2>
            <p class="help">
              Name the courses the people you want are taking. The scheduler keeps clear of
              their exams and of the hours those classes meet.
            </p>
            <div class="courses">
              {#each coursesList as course}
                <button
                  type="button" class="check course"
                  aria-pressed={targetCourses.includes(course.course_code)}
                  on:click={() => toggleCourse(course.course_code)}
                >
                  <Pad hollow={!targetCourses.includes(course.course_code)} />
                  <span class="code mono">{course.course_code}</span>
                  <span class="ttl">{course.title}</span>
                </button>
              {/each}
              {#if coursesList.length === 0}
                <p class="help">Reading the course list.</p>
              {/if}
            </div>

            {#if targetCourses.length > 0}
              <fieldset class="group">
                <legend>How far from an exam a time has to be</legend>
                <div class="choices">
                  {#each ['low', 'medium', 'high'] as s}
                    <button
                      type="button" class="check" aria-pressed={midtermSensitivity === s}
                      on:click={() => midtermSensitivity = s}
                    >
                      <Pad hollow={midtermSensitivity !== s} />
                      <span>{SENSITIVITY_LABELS[s]}</span>
                    </button>
                  {/each}
                </div>
              </fieldset>
            {/if}

          {:else if wizardStep === 4}
            <h2>Where it could be</h2>

            <fieldset class="group">
              <legend>The buildings to look in</legend>
              <div class="choices">
                {#each BUILDINGS as b}
                  {@const bc = buildingConstraints.find(x => x.building === b)}
                  <span class="building">
                    <button type="button" class="check" aria-pressed={!!bc} on:click={() => toggleBuilding(b)}>
                      <Pad hollow={!bc} />
                      <span>{b}</span>
                    </button>
                    {#if bc}
                      <select
                        aria-label="How much {b} matters" value={bc.tier}
                        style="background: var(--well)"
                        on:change={e => setBuildingTier(b, e.target.value)}
                      >
                        {#each TIERS as t}<option value={t}>{TIER_LABELS[t]}</option>{/each}
                      </select>
                    {/if}
                  </span>
                {/each}
              </div>
            </fieldset>

            <fieldset class="group">
              <legend>Rooms to leave out</legend>
              <div class="finder">
                <div class="fld">
                  <label for="w-room-search">Search for a room</label>
                  <div class="in">
                    <Pad />
                    <input
                      id="w-room-search" type="text" value={roomSearchQuery}
                      on:input={onRoomSearchInput}
                      placeholder="A building or a room number"
                    />
                  </div>
                </div>
                {#if roomSearchResults.length > 0}
                  <ul class="found">
                    {#each roomSearchResults as room}
                      <li>
                        <button type="button" class="room" on:click={() => addExcludedRoom(room)}>
                          <Pad hollow />
                          <span class="where">{room.building} {room.room_number}</span>
                          <span class="seats mono">seats {room.max_capacity}</span>
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
              {#if excludedRooms.length > 0}
                <ul class="left-out hlrow">
                  {#each excludedRooms as room}
                    <li>
                      <Highlight
                        tone="var(--danger)"
                        onclick={() => removeExcludedRoom(room.location_id)}
                        aria-label="Put {room.building} {room.room_number} back in the search"
                      >{room.building} {room.room_number}</Highlight>
                    </li>
                  {/each}
                </ul>
                <p class="help">Click a room to put it back in the search.</p>
              {/if}
            </fieldset>

          {:else if wizardStep === 5}
            <h2>What the scheduler will look for</h2>
            <ul class="review">
              {#each reviewLines as line}<li>{line}</li>{/each}
            </ul>
          {/if}
        </div>

        <div class="walk">
          <Button variant="secondary" icon="back" disabled={wizardStep === 1} onclick={() => wizardStep--}>
            Back a step
          </Button>
          {#if wizardStep < 5}
            <Button variant="primary" onclick={() => wizardStep++}>Next</Button>
          {:else}
            <Button variant="primary" busy={searching} onclick={handleSearch}>
              {searching ? 'Looking for a time' : 'Find a time'}
            </Button>
          {/if}
        </div>

      {:else}
        <!-- ── Everything at once ───────────────────────────────────────── -->
        <div class="both">
          <div class="asking">

            <section class="group">
              <h3>The event itself</h3>
              <div class="fld">
                <label for="a-duration">How long it runs</label>
                <div class="in">
                  <Pad />
                  <select id="a-duration" bind:value={durationMinutes} style="background: var(--paper)">
                    {#each DURATIONS as option}<option value={option.value}>{option.label}</option>{/each}
                  </select>
                </div>
              </div>
              <fieldset class="group">
                <legend>The dates to look between</legend>
                <div class="pair">
                  <DatePicker bind:value={startDate} label="The first date" placeholder="First date" />
                  <DatePicker bind:value={endDate} label="The last date" placeholder="Last date" min={startDate} />
                </div>
              </fieldset>
            </section>

            <section class="group">
              <h3>When it could be</h3>
              <fieldset class="group">
                <legend>How much each day of the week matters</legend>
                <DayTierPicker value={dayConstraints} on:change={e => dayConstraints = e.detail} />
              </fieldset>
              <div class="setting">
                <Switch label="Hold the search to a window of the day" bind:checked={enableTimeConstraint} />
                <span>Hold the search to a window of the day</span>
              </div>
              {#if enableTimeConstraint}
                <div class="window">
                  <Field label="From this hour" id="a-time-start" type="number" min="0" max="23"
                    bind:value={timeStartHour} class="hour" />
                  <Field label="To this hour" id="a-time-end" type="number" min="0" max="23"
                    bind:value={timeEndHour} class="hour" />
                  <div class="fld">
                    <label for="a-time-tier">How much that matters</label>
                    <div class="in">
                      <Pad />
                      <select id="a-time-tier" bind:value={timeTier} style="background: var(--paper)">
                        {#each TIERS as t}<option value={t}>{TIER_LABELS[t]}</option>{/each}
                      </select>
                    </div>
                  </div>
                </div>
              {/if}
            </section>

            <section class="group">
              <h3>Who it is for</h3>
              <div class="courses">
                {#each coursesList as course}
                  <button
                    type="button" class="check course"
                    aria-pressed={targetCourses.includes(course.course_code)}
                    on:click={() => toggleCourse(course.course_code)}
                  >
                    <Pad hollow={!targetCourses.includes(course.course_code)} />
                    <span class="code mono">{course.course_code}</span>
                    <span class="ttl">{course.title}</span>
                  </button>
                {/each}
              </div>
              {#if targetCourses.length > 0}
                <fieldset class="group">
                  <legend>How far from an exam a time has to be</legend>
                  <div class="choices">
                    {#each ['low', 'medium', 'high'] as s}
                      <button
                        type="button" class="check" aria-pressed={midtermSensitivity === s}
                        on:click={() => midtermSensitivity = s}
                      >
                        <Pad hollow={midtermSensitivity !== s} />
                        <span>{SENSITIVITY_LABELS[s]}</span>
                      </button>
                    {/each}
                  </div>
                </fieldset>
              {/if}
            </section>

            <section class="group">
              <h3>Where it could be</h3>
              <fieldset class="group">
                <legend>The buildings to look in</legend>
                <div class="choices">
                  {#each BUILDINGS as b}
                    {@const bc = buildingConstraints.find(x => x.building === b)}
                    <span class="building">
                      <button type="button" class="check" aria-pressed={!!bc} on:click={() => toggleBuilding(b)}>
                        <Pad hollow={!bc} />
                        <span>{b}</span>
                      </button>
                      {#if bc}
                        <select
                          aria-label="How much {b} matters" value={bc.tier}
                          style="background: var(--paper)"
                          on:change={e => setBuildingTier(b, e.target.value)}
                        >
                          {#each TIERS as t}<option value={t}>{TIER_LABELS[t]}</option>{/each}
                        </select>
                      {/if}
                    </span>
                  {/each}
                </div>
              </fieldset>

              <fieldset class="group">
                <legend>Rooms to leave out</legend>
                <div class="finder">
                  <div class="fld">
                    <label for="a-room-search">Search for a room</label>
                    <div class="in">
                      <Pad />
                      <input
                        id="a-room-search" type="text" value={roomSearchQuery}
                        on:input={onRoomSearchInput}
                        placeholder="A building or a room number"
                      />
                    </div>
                  </div>
                  {#if roomSearchResults.length > 0}
                    <ul class="found">
                      {#each roomSearchResults as room}
                        <li>
                          <button type="button" class="room" on:click={() => addExcludedRoom(room)}>
                            <Pad hollow />
                            <span class="where">{room.building} {room.room_number}</span>
                            <span class="seats mono">seats {room.max_capacity}</span>
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </div>
                {#if excludedRooms.length > 0}
                  <ul class="left-out hlrow">
                    {#each excludedRooms as room}
                      <li>
                        <Highlight
                          tone="var(--danger)"
                          onclick={() => removeExcludedRoom(room.location_id)}
                          aria-label="Put {room.building} {room.room_number} back in the search"
                        >{room.building} {room.room_number}</Highlight>
                      </li>
                    {/each}
                  </ul>
                  <p class="help">Click a room to put it back in the search.</p>
                {/if}
              </fieldset>
            </section>

            <div class="walk">
              <Button variant="primary" busy={searching} onclick={handleSearch}>
                {searching ? 'Looking for a time' : 'Find a time'}
              </Button>
            </div>
          </div>

          <div class="answering">
            {#if searching}
              <div class="waiting" aria-hidden="true">
                {#each Array(3) as _}<div class="bone cut" style="--cut: 14px"></div>{/each}
              </div>
            {:else if recommendations}
              <div class="results">
                <div class="tabs">
                  <button type="button" class="tab" aria-pressed={outputTab === 'curated'}
                    on:click={() => outputTab = 'curated'}>The best few</button>
                  <button type="button" class="tab" aria-pressed={outputTab === 'all'}
                    on:click={() => outputTab = 'all'}>Every time found ({recommendations.allOptions.length})</button>
                </div>
                {#if outputTab === 'curated'}
                  <div class="rows">
                    {#each recommendations.curatedPicks as rec, i}
                      <SchedulerInsightCard recommendation={rec} rank={i + 1} compact={false}
                        tone={recommendationTone} on:select={handleSelect} />
                    {/each}
                  </div>
                {:else}
                  <div class="rows">
                    {#each recommendations.allOptions as rec}
                      <SchedulerInsightCard recommendation={rec} compact={true}
                        tone={recommendationTone} on:select={handleSelect} />
                    {/each}
                  </div>
                {/if}
              </div>
            {:else}
              <EmptyState
                lead="No times yet."
                say="Say what the event needs on the left and the scheduler will read the rooms, the other events on the feed, the class timetable and the exam schedule, and come back with the times that work."
              />
            {/if}
          </div>
        </div>
      {/if}

      <!-- ── What the search found, when the wizard asked for it ─────────── -->
      {#if inputMode === 'wizard' && recommendations}
        <div class="results">
          <div class="tabs">
            <button type="button" class="tab" aria-pressed={outputTab === 'curated'}
              on:click={() => outputTab = 'curated'}>The best few</button>
            <button type="button" class="tab" aria-pressed={outputTab === 'all'}
              on:click={() => outputTab = 'all'}>Every time found ({recommendations.allOptions.length})</button>
          </div>
          {#if outputTab === 'curated'}
            <div class="rows">
              {#each recommendations.curatedPicks as rec, i}
                <SchedulerInsightCard recommendation={rec} rank={i + 1} compact={false}
                  tone={recommendationTone} on:select={handleSelect} />
              {/each}
            </div>
          {:else}
            <div class="rows">
              {#each recommendations.allOptions as rec}
                <SchedulerInsightCard recommendation={rec} compact={true}
                  tone={recommendationTone} on:select={handleSelect} />
              {/each}
            </div>
          {/if}
        </div>
      {:else if inputMode === 'wizard' && searching}
        <div class="waiting" aria-hidden="true">
          {#each Array(3) as _}<div class="bone cut" style="--cut: 14px"></div>{/each}
        </div>
      {/if}

    {:else}
      <p class="help">Reading which organizations you can schedule for.</p>
    {/if}
  {/if}
</div>

<style>
  .sched {
    display: grid;
    gap: 22px;
    align-content: start;
    padding-bottom: 60px;
  }

  .head {
    display: grid;
    gap: 8px;
  }

  /* A board tool carries its title at forty pixels, not fifty six. */
  .title {
    font-family: var(--display);
    font-stretch: 75%;
    font-variation-settings: "opsz" 96;
    font-weight: 800;
    font-size: 40px;
    line-height: 1.05;
    letter-spacing: .006em;
    margin: 0;
  }

  .about {
    margin: 0;
    color: var(--muted);
    font-size: 14.5px;
    max-width: 66ch;
  }

  .switcher,
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 20px;
  }

  .check {
    font: inherit;
    font-size: 14.5px;
    background: none;
    border: 0;
    padding: 0;
    gap: 10px;
    color: var(--ink);
    cursor: pointer;
  }

  .check[aria-pressed="false"] span {
    color: var(--muted);
  }

  .check:focus-visible,
  .tab:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 22px;
    border-bottom: 1px solid var(--line);
    padding-bottom: 8px;
  }

  .tab {
    font-family: var(--display);
    font-stretch: 85%;
    font-weight: 700;
    font-size: 15px;
    background: none;
    border: 0;
    padding: 0 0 8px;
    margin-bottom: -9px;
    min-height: 32px;
    color: var(--muted);
    cursor: pointer;
    position: relative;
  }

  .tab[aria-pressed="true"] {
    color: var(--ink);
  }

  .tab[aria-pressed="true"]::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: var(--g-current);
  }

  /* The step is said in pads and in words, so it never rides on colour alone. */
  .progress {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }

  .progress span {
    margin-left: 8px;
  }

  /*
   * The one container: the well colour, cut at fourteen pixels. It is not a
   * rounded rectangle with a hairline round it, and it carries no shadow.
   */
  .panel {
    background: var(--well);
    padding: 24px;
    display: grid;
    gap: 22px;
    align-content: start;
    min-height: 320px;
  }

  .panel h2,
  .panelhead h2 {
    font-family: var(--display);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 26px;
    line-height: 1.1;
    margin: 0;
  }

  .asking h3 {
    font-family: var(--display);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 20px;
    line-height: 1.1;
    margin: 0;
  }

  .panelhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }

  .tabbody {
    display: grid;
    gap: 20px;
    align-content: start;
  }

  .chosen {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 18px;
    margin: 0;
  }

  .chosen .when {
    font-family: var(--display);
    font-stretch: 90%;
    font-weight: 700;
    font-size: 18px;
  }

  .chosen .where {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--muted);
  }

  .group {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
    align-content: start;
  }

  .group legend,
  .name {
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 700;
    font-size: 14px;
    padding: 0;
  }

  .inner {
    display: grid;
    gap: 16px;
    padding-left: 22px;
  }

  .pair,
  .window {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 22px;
  }

  .window :global(.fld.hour) {
    max-width: 120px;
  }

  .setting {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14.5px;
  }

  .says {
    font-family: var(--display);
    font-stretch: 90%;
    font-weight: 700;
    font-size: 14px;
    margin: 0;
  }

  .help {
    font-size: 12.5px;
    color: var(--muted);
    margin: 0;
    max-width: 62ch;
  }

  .fld .in select,
  .fld .in input {
    font: inherit;
    font-size: 16px;
    border: 0;
    background: transparent;
    color: var(--ink);
    outline: 0;
    width: 100%;
    padding: 2px 0;
  }

  .building {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  .building select {
    font: inherit;
    font-size: 13px;
    border: 0;
    border-bottom: 1.5px solid var(--line-strong);
    color: var(--ink);
    padding: 4px 0;
    min-height: 32px;
  }

  /* The course list is a listing, so it is hairlines rather than a boxed panel. */
  .courses {
    display: grid;
    max-height: 240px;
    overflow-y: auto;
  }

  .course {
    display: grid;
    grid-template-columns: auto 92px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    text-align: left;
    padding: 6px 2px;
    font-size: 13.5px;
    min-height: 32px;
  }

  .course + .course {
    border-top: 1px solid var(--line);
  }

  .course .code {
    font-family: var(--mono);
    font-size: 13px;
  }

  .course .ttl {
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .finder {
    position: relative;
    max-width: 420px;
  }

  .found {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    max-height: 200px;
    overflow-y: auto;
  }

  .found li + li .room {
    border-top: 1px solid var(--line);
  }

  .room {
    font: inherit;
    font-size: 13.5px;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    background: none;
    border: 0;
    padding: 8px 2px;
    min-height: 32px;
    color: var(--ink);
    cursor: pointer;
  }

  .room .where {
    flex: 1;
  }

  .room .seats {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--muted);
  }

  .left-out {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .review {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
    font-size: 15px;
    max-width: 66ch;
  }

  .walk {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }

  .both {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    gap: 34px;
    align-items: start;
  }

  .asking {
    display: grid;
    gap: 26px;
    align-content: start;
  }

  .results {
    display: grid;
    gap: 18px;
  }

  .rows {
    display: grid;
    gap: 6px;
  }

  /* Loading draws the shape of the rows in the well colour, with no shimmer. */
  .waiting {
    display: grid;
    gap: 6px;
  }

  .bone {
    height: 116px;
    background: var(--well);
  }

  @media (max-width: 900px) {
    .both {
      grid-template-columns: 1fr;
    }
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
