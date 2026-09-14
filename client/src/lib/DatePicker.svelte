<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { campusDate, campusToday } from './campusTime.js';
  import { Icon, Pad } from './components/ui/index.js';

  export let value = '';        // YYYY-MM-DD string
  export let placeholder = 'Pick a date';
  export let min = '';
  export let max = '';
  /** What the control is called, for somebody who cannot see the words beside it. */
  export let label = 'Pick a date';
  /** The id of the words that name it, when a name already sits above it. */
  export let describedBy = undefined;

  const dispatch = createEventDispatcher();

  let open = false;
  let viewYear = 0;
  let viewMonth = 0;
  let el;

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  function initView() {
    // Opening on no value opens on the current month on campus, which is the
    // month whose events the picker is about to filter.
    const day = value || campusToday();
    viewYear = parseInt(day.slice(0, 4));
    viewMonth = parseInt(day.slice(5, 7)) - 1;
  }
  initView();

  $: if (value !== undefined) initView();

  $: selectedParts = value
    ? { y: parseInt(value.slice(0,4)), m: parseInt(value.slice(5,7)) - 1, d: parseInt(value.slice(8,10)) }
    : null;

  $: calendarDays = buildCalendar(viewYear, viewMonth);

  function buildCalendar(year, month) {
    const startDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }

  function selectDay(day) {
    if (!day || isDisabled(day)) return;
    const m = String(viewMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    value = `${viewYear}-${m}-${d}`;
    dispatch('change', value);
    open = false;
  }

  function prevMonth() {
    if (viewMonth === 0) { viewMonth = 11; viewYear--; }
    else viewMonth--;
  }
  function nextMonth() {
    if (viewMonth === 11) { viewMonth = 0; viewYear++; }
    else viewMonth++;
  }

  /**
   * A day with no hour on it is a day on campus, so it is read at noon there.
   * Read as an instant instead it is midnight in UTC, which is the evening
   * before on campus, and the picker would show the day before the one chosen.
   */
  function formatDisplay(v) {
    if (!v) return null;
    return campusDate(`${v} 12:00`, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function isSelected(day) {
    if (!selectedParts || !day) return false;
    return selectedParts.y === viewYear && selectedParts.m === viewMonth && selectedParts.d === day;
  }

  function isToday(day) {
    const pad = n => String(n).padStart(2, '0');
    return campusToday() === `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
  }

  function isDisabled(day) {
    if (!day) return true;
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (min && dateStr < min) return true;
    if (max && dateStr > max) return true;
    return false;
  }

  onMount(() => {
    function handleOutside(e) {
      if (el && !el.contains(e.target)) open = false;
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  });
</script>

<div class="picker" bind:this={el}>
  <!--
    The trigger is the field's line: a pad, the date, and a rule under them.
    It was a rounded rectangle with a hairline around it, which is the one
    container shape the design does not use.
  -->
  <button
    type="button"
    class="trigger"
    class:unset={!value}
    aria-label={label}
    aria-describedby={describedBy}
    aria-expanded={open}
    on:click={() => open = !open}
  >
    <Pad hollow={!value} />
    <span class="said">{formatDisplay(value) ?? placeholder}</span>
    <Icon name="cal" />
  </button>

  {#if open}
    <div class="sheet cut" style="--cut: 14px">
      <div class="months">
        <button type="button" class="step" aria-label="Previous month" on:click={prevMonth}>
          <Icon name="back" />
        </button>
        <span class="month">{MONTHS[viewMonth]} {viewYear}</span>
        <button type="button" class="step" aria-label="Next month" on:click={nextMonth}>
          <Icon name="arrow" />
        </button>
      </div>

      <div class="grid">
        {#each DOW as d}
          <span class="dow">{d}</span>
        {/each}
        {#each calendarDays as day}
          {#if day === null}
            <span></span>
          {:else}
            <button
              type="button"
              class="date"
              class:on={isSelected(day)}
              class:now={isToday(day)}
              aria-pressed={isSelected(day)}
              aria-label="{MONTHS[viewMonth]} {day}, {viewYear}"
              disabled={isDisabled(day)}
              on:click={() => selectDay(day)}
            >
              <span class="n">{day}</span>
              <span class="mark">{#if isSelected(day)}<Pad />{/if}</span>
            </button>
          {/if}
        {/each}
      </div>

      {#if value}
        <button
          type="button"
          class="clear"
          on:click={() => { value = ''; dispatch('change', ''); open = false; }}
        >Clear the date</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .picker {
    position: relative;
    width: 268px;
    max-width: 100%;
  }

  .trigger {
    font: inherit;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    background: none;
    border: 0;
    border-bottom: 2px solid var(--line-strong);
    padding: 6px 0;
    min-height: 32px;
    color: var(--ink);
    cursor: pointer;
  }

  .trigger.unset .said {
    color: var(--muted);
  }

  .trigger:focus-visible {
    outline: none;
    border-bottom-color: var(--primary);
    box-shadow: 0 2px 0 0 var(--primary);
  }

  .said {
    flex: 1;
  }

  /* The sheet floats above the page, which is the one thing that takes a shadow. */
  .sheet {
    position: absolute;
    left: 0;
    top: 100%;
    z-index: 50;
    margin-top: 6px;
    width: 268px;
    display: grid;
    gap: 10px;
    padding: 14px;
    background: var(--card);
    box-shadow: var(--shadow-float);
    user-select: none;
  }

  .months {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .month {
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 700;
    font-size: 15px;
  }

  .step {
    font: inherit;
    font-size: 16px;
    background: none;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    min-width: 32px;
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .step:hover,
  .step:focus-visible {
    color: var(--ink);
  }

  .step:focus-visible,
  .clear:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    text-align: center;
  }

  .dow {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--muted);
  }

  .date {
    font: inherit;
    background: none;
    border: 0;
    cursor: pointer;
    min-height: 32px;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 2px;
    padding: 2px 0;
    color: var(--ink);
  }

  .date .n {
    font-family: var(--display);
    font-stretch: 75%;
    font-weight: 700;
    font-size: 16px;
    line-height: 1;
  }

  .date .mark {
    height: 8px;
    display: block;
  }

  .date.on .n {
    color: var(--primary);
  }

  /* Today's number is the signal colour, as it is on the calendar. */
  .date.now .n {
    color: var(--signal-text);
  }

  .date:hover:not(:disabled) .n,
  .date:focus-visible .n {
    color: var(--primary);
  }

  .date:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  /*
   * A day that cannot be chosen is still a word, and the design keeps words out
   * of the faint gray, so it is the muted ink held back rather than the faint
   * token.
   */
  .date:disabled {
    cursor: default;
    color: var(--muted);
    opacity: .5;
  }

  .clear {
    font: inherit;
    font-size: 12.5px;
    background: none;
    border: 0;
    border-top: 1px solid var(--line);
    color: var(--muted);
    cursor: pointer;
    padding: 8px 0 0;
    min-height: 32px;
  }

  .clear:hover {
    color: var(--ink);
  }
</style>
