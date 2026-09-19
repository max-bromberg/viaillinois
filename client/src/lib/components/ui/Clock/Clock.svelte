<script>
  import { campusShortDate, campusTime, toInstant } from '../../../campusTime.js';

  /**
   * The clock.
   *
   * The time in the sky band. The hour and the minute are set in the thinnest
   * condensed cut at the largest size, with the meridiem small beside them and
   * the date in mono under them.
   *
   * The kiosk has a clock of its own rather than this one. It is read from
   * across a lobby, so it is larger, it writes the date out in full, and its
   * rules hang off .k-top rather than off .clock. KioskStage draws it.
   *
   * Every time on the site is campus time, read through client/src/lib/campusTime.js,
   * so the band and the agenda never disagree about what hour it is.
   *
   * See docs/design/05-typography.md and docs/design/07-components.md.
   */
  let {
    /** The instant to show. */
    at = null,
    /** Which sky is overhead, so the line under the time can say so. */
    sky = null,
    /** Where this is, which is one campus. */
    place = 'Urbana',
    class: className = '',
    ...rest
  } = $props();

  const instant = $derived(toInstant(at));
  const shown = $derived(instant ? campusTime(instant) : '');
  /** "6:41 PM" arrives as one string, and the meridiem is set apart from it. */
  const parts = $derived(shown ? shown.split(' ') : []);
  const date = $derived(instant ? campusShortDate(instant) : '');
  /*
   * The sky is over the campus rather than over one building. The lobby screen
   * hangs in a building, and VIA is not that building: the organizations it
   * serves belong to a department, most of them meet in several buildings, and
   * a reader two doors down is under the same sky.
   */
  const under = $derived(sky ? `${date} · ${sky} over ${place}` : `${date} · ${place}`);
</script>

{#if instant}
  <div class={['clock', className].filter(Boolean).join(' ')} {...rest}>
    <div class="t">
      <time datetime={instant.toISOString()}>{parts[0]}{#if parts[1]}<small>{parts[1]}</small>{/if}</time>
    </div>
    <div class="d">{under}</div>
  </div>
{/if}
