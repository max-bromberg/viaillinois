<script>
  import { createEventDispatcher, tick } from 'svelte';
  import { campusToday } from '../../../campusTime.js';
  import Icon from '../Icon/Icon.svelte';
  import Pad from '../Pad/Pad.svelte';

  /**
   * One month of days, which is the part every date control on the site is
   * built from.
   *
   * It holds no date of its own and decides nothing. The month it draws and the
   * days marked on it are given to it, and clicking a day or walking off the
   * end of the month says so and waits. That is what lets the date field and
   * the picker that takes a set of dates be arrangements of one calendar rather
   * than two calendars that drift apart.
   *
   * Dates are YYYY-MM-DD throughout, which sorts and compares as a string, so
   * no date on this calendar is ever read as an instant. A day read as an
   * instant is midnight in UTC, which is the evening before on campus, and the
   * calendar would mark the day before the one somebody chose.
   */

  /** The year on view. */
  export let year;
  /** The month on view, from 0 for January. */
  export let month;
  /** The days marked as chosen, as YYYY-MM-DD. */
  export let selected = [];
  /** The earliest day that may be chosen, as YYYY-MM-DD. */
  export let min = '';
  /** The latest day that may be chosen, as YYYY-MM-DD. */
  export let max = '';
  /** What the grid is called, for somebody who cannot see it. */
  export let label = 'Calendar';
  /** Today on campus, which the calendar marks. */
  export let today = campusToday();

  const dispatch = createEventDispatcher();

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  const CAPS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let grid;
  /** The day the arrow keys move from, as YYYY-MM-DD. One day of the month is in the tab order. */
  let resting = '';
  /** Whether the last move came from the keyboard, which is the only time focus is taken. */
  let byKey = false;

  const pad = n => String(n).padStart(2, '0');
  const dateOf = day => `${year}-${pad(month + 1)}-${pad(day)}`;
  const dayOf = date => Number(date.slice(8, 10));

  $: chosen = new Set(selected);
  $: monthName = `${MONTHS[month]} ${year}`;

  /** The days of the month, in weeks, with the days before the first left empty. */
  $: weeks = (() => {
    const startDow = new Date(year, month, 1).getDay();
    const length = new Date(year, month + 1, 0).getDate();
    const cells = [
      ...Array.from({ length: startDow }, () => null),
      ...Array.from({ length }, (unused, index) => index + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    return Array.from({ length: cells.length / 7 }, (unused, week) => cells.slice(week * 7, week * 7 + 7));
  })();

  const outOfRange = date => (min !== '' && date < min) || (max !== '' && date > max);

  /**
   * Where the arrow keys start from in the month on view: the day already
   * chosen, or today, or the first day the calendar will accept. A month with
   * no day in the tab order is a month the keyboard cannot reach at all.
   */
  $: resting = (() => {
    if (resting !== '' && resting.slice(0, 7) === `${year}-${pad(month + 1)}` && !outOfRange(resting)) {
      return resting;
    }
    const days = weeks.flat().filter(Boolean).map(dateOf);
    return days.find(date => chosen.has(date))
      ?? days.find(date => date === today && !outOfRange(date))
      ?? days.find(date => !outOfRange(date))
      ?? days[0]
      ?? '';
  })();

  function choose(day) {
    const date = dateOf(day);
    if (outOfRange(date)) return;
    dispatch('choose', date);
  }

  /** Move the month on view by a number of months, turning the year over at its ends. */
  function step(by) {
    const shifted = month + by;
    dispatch('view', {
      year: year + Math.floor(shifted / 12),
      month: ((shifted % 12) + 12) % 12,
    });
  }

  /** A date a number of days from another one, as YYYY-MM-DD. */
  function shift(date, days) {
    const moved = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, dayOf(date) + days);
    return `${moved.getFullYear()}-${pad(moved.getMonth() + 1)}-${pad(moved.getDate())}`;
  }

  /**
   * Move the resting day, and the month with it when the move leaves this one.
   * A move that would land outside the range stays where it is, so the arrows
   * never leave the focus on a day the calendar is going to refuse.
   */
  function moveTo(date) {
    if (outOfRange(date)) return;
    byKey = true;
    resting = date;
    if (date.slice(0, 7) !== `${year}-${pad(month + 1)}`) {
      dispatch('view', { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) - 1 });
    }
  }

  /**
   * Page the month from the keyboard, carrying the resting day with it.
   *
   * Paging moved the month and left the resting day on the month it came from,
   * so the reactive fallback put the tab stop on the first day of the new one
   * while the browser kept the focus ring where it was: the day cells are not
   * keyed, so the ring stays on the same cell of the grid. A reader paged
   * forward, saw the ring on the sixteenth, pressed the right arrow expecting
   * the seventeenth, and went back a fortnight. The same day of the month is
   * what a reader expects to land on, shortened to the last day when the month
   * is shorter, and given up to the fallback when the range refuses it.
   */
  function pageBy(months) {
    const shifted = month + months;
    const toYear = year + Math.floor(shifted / 12);
    const toMonth = ((shifted % 12) + 12) % 12;
    const lastOfMonth = new Date(toYear, toMonth + 1, 0).getDate();
    const wanted = `${toYear}-${pad(toMonth + 1)}-${pad(Math.min(dayOf(resting), lastOfMonth))}`;

    byKey = true;
    // Set before the month is asked for, so that the day and the month it is
    // in reach the reactive recompute together, which is what the arrow keys
    // already rely on when they walk off the end of a month.
    resting = outOfRange(wanted) ? '' : wanted;
    dispatch('view', { year: toYear, month: toMonth });
  }

  function onKey(event) {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in moves) {
      event.preventDefault();
      moveTo(shift(resting, moves[event.key]));
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const dow = new Date(Number(resting.slice(0, 4)), Number(resting.slice(5, 7)) - 1, dayOf(resting)).getDay();
      moveTo(shift(resting, event.key === 'Home' ? -dow : 6 - dow));
      return;
    }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      const by = event.key === 'PageUp' ? -1 : 1;
      pageBy(event.shiftKey ? by * 12 : by);
    }
  }

  // Focus follows the resting day only when the keyboard moved it. Taking focus
  // on a click would pull it out of whatever the calendar was opened from, and
  // taking it on the first draw would pull it out of the page.
  $: if (byKey && resting && grid) {
    byKey = false;
    tick().then(() => grid?.querySelector('.dbtn[tabindex="0"]')?.focus());
  }
</script>

<div class="cal">
  <div class="mhead">
    <button type="button" class="mstep" aria-label="Previous month" on:click={() => step(-1)}>
      <Icon name="prev" />
    </button>
    <b aria-live="polite">{monthName}</b>
    <button type="button" class="mstep" aria-label="Next month" on:click={() => step(1)}>
      <Icon name="next" />
    </button>
  </div>

  <!--
    The grid takes the keys because the day buttons share one tab stop: only the
    resting day is in the tab order, so a key pressed inside the month is a key
    pressed on that day. Its own tabindex of -1 keeps it out of the tab order
    while leaving it something the browser can focus.
  -->
  <div class="grd" role="grid" tabindex="-1" aria-label={label} bind:this={grid} on:keydown={onKey}>
    <div class="wkrow" role="row">
      {#each CAPS as cap, index}
        <span class="dcap" role="columnheader" aria-label={WEEKDAYS[index]}>{cap}</span>
      {/each}
    </div>
    {#each weeks as week}
      <div class="wkrow" role="row">
        {#each week as day}
          <span role="gridcell">
            {#if day !== null}
              <button
                type="button"
                class="dbtn"
                class:now={dateOf(day) === today}
                tabindex={dateOf(day) === resting ? 0 : -1}
                aria-pressed={chosen.has(dateOf(day))}
                aria-label="{MONTHS[month]} {day}, {year}"
                disabled={outOfRange(dateOf(day))}
                on:click={() => choose(day)}
              >
                <b>{day}</b>
                <Pad />
              </button>
            {/if}
          </span>
        {/each}
      </div>
    {/each}
  </div>

  <!--
    Whatever the control using this calendar puts under it: the count of dates
    chosen, or the words that clear a field. It sits inside the calendar rather
    than beside it so that it takes the calendar's own width and spacing.
  -->
  <slot />
</div>

<style>
  /*
   * The calendar itself is in the design system, under .cal in
   * docs/design/reference/foundation.css, so there is nothing to say about a
   * day or a week here. What is left is the grid's own stacking, which is
   * layout rather than look.
   */
  .grd {
    display: grid;
    gap: 4px;
  }

  [role='gridcell'] {
    display: block;
    min-width: 0;
  }
</style>
