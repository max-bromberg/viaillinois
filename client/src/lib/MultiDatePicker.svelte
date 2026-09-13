<script>
  import { createEventDispatcher } from 'svelte';
  import { campusToday } from './campusTime.js';
  import { Icon, Pad } from './components/ui/index.js';

  /**
   * Picking a set of dates that follow no rule.
   *
   * Some of what an RSO holds is three evenings across a term with nothing in
   * common between them, and until now each of those was an event entered by
   * hand. Clicking a day adds it and clicking it again takes it away, so the
   * month being looked at is also the record of what has been chosen in it.
   *
   * The dates are held as YYYY-MM-DD, in order, whatever order they were
   * clicked in, because the series that comes out of them runs from the first
   * to the last.
   */

  /** The dates chosen, as YYYY-MM-DD. */
  export let value = [];
  /** The month drawn first, as YYYY-MM. Defaults to the month on campus. */
  export let month = campusToday().slice(0, 7);
  /** The earliest date that may be chosen, as YYYY-MM-DD. */
  export let min = '';

  const dispatch = createEventDispatcher();

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  let viewYear = Number(month.slice(0, 4));
  let viewMonth = Number(month.slice(5, 7)) - 1;

  const pad = n => String(n).padStart(2, '0');
  const dateOf = day => `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;

  $: chosen = new Set(value);
  $: cells = (() => {
    const startDow = new Date(viewYear, viewMonth, 1).getDay();
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    return [
      ...Array.from({ length: startDow }, () => null),
      ...Array.from({ length: days }, (_, i) => i + 1),
    ];
  })();

  const disabled = day => Boolean(min) && dateOf(day) < min;

  function toggle(day) {
    if (disabled(day)) return;
    const date = dateOf(day);
    const next = chosen.has(date)
      ? value.filter(one => one !== date)
      : [...value, date].sort();
    value = next;
    dispatch('change', next);
  }

  function step(by) {
    const shifted = viewMonth + by;
    viewYear += Math.floor(shifted / 12);
    viewMonth = ((shifted % 12) + 12) % 12;
  }
</script>

<div class="picker">
  <div class="nav">
    <button type="button" class="step" aria-label="Previous month" on:click={() => step(-1)}>
      <Icon name="back" />
    </button>
    <span class="month">{MONTHS[viewMonth]} {viewYear}</span>
    <button type="button" class="step" aria-label="Next month" on:click={() => step(1)}>
      <Icon name="arrow" />
    </button>
  </div>

  <div class="grid">
    {#each DOW as day}
      <span class="dow">{day}</span>
    {/each}
    {#each cells as day}
      {#if day === null}
        <span></span>
      {:else}
        <button
          type="button"
          class="day"
          aria-pressed={chosen.has(dateOf(day))}
          aria-label="{MONTHS[viewMonth]} {day}, {viewYear}"
          disabled={disabled(day)}
          on:click={() => toggle(day)}
        >
          <span class="n">{day}</span>
          <span class="mark">{#if chosen.has(dateOf(day))}<Pad />{/if}</span>
        </button>
      {/if}
    {/each}
  </div>

  <p class="count">
    {value.length === 1 ? '1 date chosen' : `${value.length} dates chosen`}
  </p>
</div>

<style>
  .picker {
    display: grid;
    gap: 10px;
    width: 268px;
  }

  .nav {
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
    background: none;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    min-width: 32px;
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  }

  .step:hover,
  .step:focus-visible {
    color: var(--ink);
  }

  .step:focus-visible {
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
    padding-bottom: 2px;
  }

  /*
   * A day is the number and, under it, the pad that says it was chosen. The
   * chosen day used to be a filled rectangle, which is the one shape the
   * design does not use for a state.
   */
  .day {
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

  .day .n {
    font-family: var(--display);
    font-stretch: 75%;
    font-weight: 700;
    font-size: 16px;
    line-height: 1;
  }

  .day .mark {
    height: 8px;
    display: block;
  }

  .day[aria-pressed="true"] .n {
    color: var(--primary);
  }

  .day:hover:not(:disabled) .n,
  .day:focus-visible .n {
    color: var(--primary);
  }

  .day:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .day:disabled {
    cursor: default;
    color: var(--faint);
  }

  .count {
    font-size: 12.5px;
    color: var(--muted);
  }
</style>
