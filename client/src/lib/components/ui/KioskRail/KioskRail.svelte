<script>
  import { campusDate, campusDayName, campusTime, toInstant } from '../../../campusTime.js';
  import { locationLabel } from '../../../locationLabel.js';

  /**
   * The kiosk rail.
   *
   * A 360 pixel column down the right of the lobby screen, standing on a darker
   * translucent ground so that the stage beside it keeps the eye first. It lists
   * what comes next with the hours set large enough to read while walking past,
   * and it ends with this month's midterms, which is what a student passing a
   * lobby screen in October has come to find.
   *
   * See docs/design/07-components.md and docs/design/08-surfaces.md.
   */
  let {
    /** What is on next, in the order it should be read. */
    next = [],
    /** This month's midterms, in the order they fall. */
    midterms = [],
    /** The hour it is now on campus, which is what "Today" is measured from. */
    now = new Date(),
    class: className = '',
    ...rest
  } = $props();

  /**
   * The rail sets the hour and leaves the meridiem to the day beneath it, which
   * is what the reference render draws. The datetime carries the whole instant,
   * so a screen reader is never left to guess which seven o'clock this is.
   */
  const hourOf = value => campusTime(value).replace(/\s*[AP]M$/i, '');

  /** The instant a time names, for the datetime a screen reader is given. */
  const machine = value => toInstant(value)?.toISOString();

  /** A midterm reads as its course and then what the exam is called. */
  const examName = exam => [exam?.course_code, exam?.title].filter(Boolean).join(' ');
</script>

<div class={['side', className].filter(Boolean).join(' ')} {...rest}>
  <h3>Next up</h3>

  {#if next.length === 0}
    <p>Nothing else is on today. The feed at viaillinois.com has the rest of the week.</p>
  {:else}
    {#each next as item, at (item.event_id ?? at)}
      <div class="item">
        <time class="t" datetime={machine(item.start_time)}>{hourOf(item.start_time)}<small>{campusDayName(item.start_time, now)}</small></time>
        <div>
          <b>{item.title}</b>
          <span>{item.rso_name} &middot; {locationLabel(item)}</span>
        </div>
      </div>
    {/each}
  {/if}

  {#if midterms.length > 0}
    <!--
      The midterms sit at the foot of the column however many events are listed
      above them, which is what the reference render says with this same inline
      rule on the second heading.
    -->
    <h3 style="margin-top: auto">Midterms</h3>
    {#each midterms as exam, at (exam.midterm_id ?? at)}
      <div class="item">
        <time class="t" datetime={machine(exam.start_time)}>{campusDate(exam.start_time, { month: 'short', day: 'numeric' })}</time>
        <div>
          <b>{examName(exam)}</b>
          <span>{locationLabel(exam)} &middot; {campusTime(exam.start_time)}</span>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  /*
   * The reference mock always has five events to list, so it never needed a way
   * to say that there are none. The sentence stands where the list would, in the
   * secondary ink of the dark palette, because the kiosk is dark in either theme
   * and cannot take an ink that moves with it.
   */
  .side p {
    margin: 0;
    color: var(--ink-2);
    font-size: 15px;
    line-height: 1.5;
  }
</style>
