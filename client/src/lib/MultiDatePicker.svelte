<script>
  import { createEventDispatcher } from 'svelte';
  import { campusToday } from './campusTime.js';

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

<div class="rounded-md border p-3 space-y-2 bg-background">
  <div class="flex items-center justify-between">
    <button
      type="button" aria-label="Previous month" on:click={() => step(-1)}
      class="px-2 py-1 text-sm border rounded-md hover:bg-accent transition-colors"
    >‹</button>
    <span class="text-sm font-medium">{MONTHS[viewMonth]} {viewYear}</span>
    <button
      type="button" aria-label="Next month" on:click={() => step(1)}
      class="px-2 py-1 text-sm border rounded-md hover:bg-accent transition-colors"
    >›</button>
  </div>

  <div class="grid grid-cols-7 gap-0.5 text-center">
    {#each DOW as day}
      <span class="text-[10px] uppercase tracking-wide text-muted-foreground py-1">{day}</span>
    {/each}
    {#each cells as day}
      {#if day === null}
        <span></span>
      {:else}
        <button
          type="button"
          aria-pressed={chosen.has(dateOf(day))}
          aria-label="{MONTHS[viewMonth]} {day}, {viewYear}"
          disabled={disabled(day)}
          on:click={() => toggle(day)}
          class="text-xs h-8 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed
            {chosen.has(dateOf(day))
              ? 'bg-primary text-primary-foreground font-medium'
              : 'hover:bg-accent'}"
        >{day}</button>
      {/if}
    {/each}
  </div>

  <p class="text-xs text-muted-foreground">
    {value.length === 1 ? '1 date chosen' : `${value.length} dates chosen`}
  </p>
</div>
