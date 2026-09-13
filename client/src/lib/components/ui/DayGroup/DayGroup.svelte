<script>
  import { Pad } from '../Pad/index.js';
  import { campusDayName, campusShortDate, campusStartOfDay, isSameCampusDay } from '../../../campusTime.js';

  /**
   * A day in the agenda.
   *
   * A two column grid: the day name set large in the left column, the date in
   * mono under it, a pad beside it, and the day's rows in the right column. The
   * day name is the largest thing in the column so that a week can be scanned
   * without reading a single title, which is what makes the page an agenda
   * rather than a list of cards.
   *
   * Today's name is in signal and its pad breathes. The pad breathes more slowly
   * than the pad on a live row, so the two never pulse in step.
   *
   * See docs/design/07-components.md.
   */
  let {
    /** Which day this is. */
    day,
    /** The day it is now on campus, which decides what is today. */
    now = new Date(),
    class: className = '',
    children,
    ...rest
  } = $props();

  const today = $derived(isSameCampusDay(day, now));
  const name = $derived(campusDayName(day, now));
  const date = $derived(campusShortDate(day));
  const machine = $derived(campusStartOfDay(day));
</script>

<section class={['day', today && 'today', className].filter(Boolean).join(' ')} {...rest}>
  <div class="dh">
    <!--
      The day name is a heading, so a screen reader can move through the agenda
      a day at a time. "Today" on its own does not say which day it is, so the
      date travels with it, and the part already on screen is not read twice.
    -->
    <h3>
      <b>{name}</b>
      <span><time datetime={machine}>{date}</time></span>
    </h3>
    <Pad hollow={!today} tone={today ? 'var(--signal)' : undefined} breathing={today} pace={today ? '2s' : null} />
  </div>
  <div>{@render children?.()}</div>
</section>

<style>
  /*
   * The heading carries no size of its own. The stylesheet sets the day name
   * from .day .dh b and the date from .day .dh span, which is what the reference
   * render was approved on, so the heading is a wrapper and nothing more.
   */
  h3 {
    font: inherit;
    margin: 0;
    display: contents;
  }
</style>
