<script>
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { campusDate, campusToday } from './campusTime.js';
  import { Button, Icon, MonthCalendar, Pad } from './components/ui/index.js';

  /**
   * One date, taken from a field that opens a calendar.
   *
   * The field is the design's own field: a line, a pad at its start, and no box
   * around it. The calendar that drops out of it is the design system's month,
   * which the picker that takes a set of dates uses as well, so there is one
   * calendar on the site rather than one per control.
   */

  /** The date held, as YYYY-MM-DD. */
  export let value = '';
  /** What the field says when it holds nothing. */
  export let placeholder = 'Pick a date';
  /** The earliest date that may be chosen, as YYYY-MM-DD. */
  export let min = '';
  /** The latest date that may be chosen, as YYYY-MM-DD. */
  export let max = '';
  /** What the control is called, for somebody who cannot see the words beside it. */
  export let label = 'Pick a date';
  /** The id of the words that name it, when a name already sits above it. */
  export let describedBy = undefined;

  const dispatch = createEventDispatcher();

  let open = false;
  let focused = false;
  let viewYear = 0;
  let viewMonth = 0;
  let root;
  let trigger;

  /**
   * A day with no hour on it is a day on campus, so it is read at noon there.
   * Read as an instant instead it is midnight in UTC, which is the evening
   * before on campus, and the field would say the day before the one chosen.
   */
  const said = date => (date
    ? campusDate(`${date} 12:00`, { month: 'short', day: 'numeric', year: 'numeric' })
    : placeholder);

  /** The calendar opens on the month of the date held, or on the month on campus. */
  function openOnItsOwnMonth() {
    const day = value || campusToday();
    viewYear = Number(day.slice(0, 4));
    viewMonth = Number(day.slice(5, 7)) - 1;
  }

  function show() {
    openOnItsOwnMonth();
    open = true;
  }

  async function hide({ returning = false } = {}) {
    open = false;
    if (!returning) return;
    await tick();
    trigger?.focus();
  }

  function settle(date) {
    value = date;
    dispatch('change', date);
    hide({ returning: true });
  }

  onMount(() => {
    // A click anywhere else shuts the sheet. It is watched on the document
    // rather than on the sheet, because what closes it is everything the sheet
    // is not.
    const away = event => { if (root && !root.contains(event.target)) open = false; };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  });
</script>

<svelte:window on:keydown={event => { if (event.key === 'Escape' && open) hide({ returning: true }); }} />

<div class="picker" bind:this={root}>
  <div class="fld" class:focus={open || focused}>
    <div class="in">
      <button
        type="button"
        class="face"
        class:unsaid={!value}
        bind:this={trigger}
        aria-label={label}
        aria-describedby={describedBy}
        aria-haspopup="dialog"
        aria-expanded={open}
        on:click={() => (open ? hide() : show())}
        on:focus={() => (focused = true)}
        on:blur={() => (focused = false)}
      >
        <Pad hollow={!value} />
        <span class="val">{said(value)}</span>
        <Icon name="cal" />
      </button>
    </div>
  </div>

  {#if open}
    <!-- The one thing on a reading page that floats, which is what the elevation table gives a date picker. -->
    <div class="sheet cut" style="--cut: 14px" role="dialog" aria-label={label}>
      <MonthCalendar
        year={viewYear}
        month={viewMonth}
        selected={value ? [value] : []}
        {min}
        {max}
        {label}
        on:choose={event => settle(event.detail)}
        on:view={event => { viewYear = event.detail.year; viewMonth = event.detail.month; }}
      >
        {#if value}
          <div class="clear">
            <Button variant="quiet" size="sm" on="card" onclick={() => settle('')}>Clear the date</Button>
          </div>
        {/if}
      </MonthCalendar>
    </div>
  {/if}
</div>

<style>
  .picker {
    position: relative;
    width: 268px;
    max-width: 100%;
  }

  /*
   * The field's line, its pad and its focus state are the design system's, under
   * .fld. What belongs to this control is that the line is a button rather than
   * an input, because the date is chosen on a calendar and never typed.
   */
  .face {
    font: inherit;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 0;
    text-align: left;
    background: none;
    border: 0;
    color: var(--ink);
    cursor: pointer;
    min-height: 32px;
  }

  .face:focus-visible {
    outline: none;
  }

  .val {
    flex: 1;
  }

  .face.unsaid .val {
    color: var(--muted);
  }

  .sheet {
    position: absolute;
    left: 0;
    top: 100%;
    z-index: 50;
    margin-top: 6px;
    display: grid;
    gap: 10px;
    padding: 14px;
    background: var(--card);
    box-shadow: var(--shadow-float);
  }

  .clear {
    border-top: 1px solid var(--line);
    padding-top: 6px;
  }
</style>
