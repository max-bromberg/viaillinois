<script>
  import { createEventDispatcher } from 'svelte';
  import { campusToday } from './campusTime.js';
  import { MonthCalendar } from './components/ui/index.js';

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
   *
   * The calendar itself is the design system's, which the date field uses as
   * well. What belongs here is what a click means and the count underneath.
   */

  /** The dates chosen, as YYYY-MM-DD. */
  export let value = [];
  /** The month drawn first, as YYYY-MM. Defaults to the month on campus. */
  export let month = campusToday().slice(0, 7);
  /** The earliest date that may be chosen, as YYYY-MM-DD. */
  export let min = '';
  /** What the calendar is called, for somebody who cannot see it. */
  export let label = 'Pick the dates';

  const dispatch = createEventDispatcher();

  let viewYear = Number(month.slice(0, 4));
  let viewMonth = Number(month.slice(5, 7)) - 1;

  /** A day already chosen is taken away, and a day that is not is added. */
  function toggle(date) {
    const next = value.includes(date)
      ? value.filter(one => one !== date)
      : [...value, date].sort();
    value = next;
    dispatch('change', next);
  }
</script>

<MonthCalendar
  year={viewYear}
  month={viewMonth}
  selected={value}
  {min}
  {label}
  on:choose={event => toggle(event.detail)}
  on:view={event => { viewYear = event.detail.year; viewMonth = event.detail.month; }}
>
  <p class="tally">
    {value.length === 1 ? '1 date chosen' : `${value.length} dates chosen`}
  </p>
</MonthCalendar>
