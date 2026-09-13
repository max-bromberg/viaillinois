<script>
  import { Mark } from '../Mark/index.js';
  import { Pad } from '../Pad/index.js';
  import { campusDate, campusStartOfDay, campusTime, toInstant } from '../../../campusTime.js';
  import { locationLabel } from '../../../locationLabel.js';
  import { organizationColor } from '../../../organizationColor.js';

  /**
   * The kiosk stage.
   *
   * The night sky as the whole screen, with the circuit board drawn on a canvas
   * at low opacity behind it and a signal glow at the lower left. The top row
   * carries the now tag and a clock, because the lobby has none of its own.
   * Below the spacer sit the organization, the title in the biggest type in the
   * system, and the hour the event ends beside the room. The mark, the domain
   * and the position in the rotation sign the foot.
   *
   * The stage is always the night sky whatever the hour, because the lobby
   * screen is the one place the board should be visible at full strength. See
   * docs/design/08-surfaces.md.
   *
   * The board is handed in rather than drawn here. It is a canvas that paints
   * once per resize rather than once per frame, and the component that owns that
   * decision is client/src/lib/CircuitBackground.svelte. The rail goes in as the
   * children, so that it lands in the second column of the kiosk grid.
   */
  let {
    /** The event on screen: its title, organization, hours and room. */
    event,
    /** The hour it is now on campus, which the clock reads and the now tag asks. */
    now = new Date(),
    /** Which event of the rotation this is, counting from one. */
    position = null,
    /** How many events the rotation holds. */
    count = null,
    /** Where the screen sends anybody who wants the rest of the week. */
    domain = 'viaillinois.com',
    /** The circuit board, drawn behind everything on the stage. */
    board = undefined,
    /** Whatever stands in the second column, which is the kiosk rail. */
    children,
    class: className = '',
    ...rest
  } = $props();

  /**
   * The display face sets the reading large and the meridiem small beside it, so
   * the two are handed to the markup apart rather than as one string.
   */
  function clockParts(value) {
    const text = campusTime(value);
    const space = text.lastIndexOf(' ');
    return space === -1
      ? { reading: text, suffix: '' }
      : { reading: text.slice(0, space), suffix: text.slice(space + 1) };
  }

  /** The instant a time names, for the datetime a screen reader is given. */
  const machine = value => toInstant(value)?.toISOString();

  const clock = $derived(clockParts(now));
  const day = $derived(campusDate(now, { weekday: 'long', month: 'long', day: 'numeric' }));

  /**
   * An event is running when the hour is inside it. An event filed without an
   * end time is never called live, because there is nothing to say when it
   * stopped, and a lobby screen that reads "Happening now" for three days is
   * worse than one that says nothing.
   */
  const live = $derived.by(() => {
    const start = toInstant(event?.start_time);
    const end = toInstant(event?.end_time);
    const hour = toInstant(now);
    return Boolean(start && end && hour && hour >= start && hour < end);
  });

  /** Until the event ends, or, where nobody said when it ends, when it starts. */
  const when = $derived(
    event?.end_time
      ? { label: 'Until', value: event.end_time }
      : { label: 'Starts', value: event?.start_time },
  );
  const ends = $derived(clockParts(when.value));

  /** The kiosk is dark in either theme, so the mark takes its dark reading. */
  const mark = $derived(organizationColor(event?.logo_color, 'mark', 'dark'));

  /** One of one is the whole rotation, and saying so tells nobody anything. */
  const rotation = $derived(position && count && count > 1 ? `${position} of ${count}` : null);
</script>

<div class={['kiosk', className].filter(Boolean).join(' ')} {...rest}>
  <div class="main">
    {@render board?.()}

    <div class="k-top">
      {#if live}
        <!--
          A live event says so in words. The pad beside it breathes through the
          .nowtag rule in app.css, and the reference sets this one instance a
          little larger than the tag takes elsewhere.
        -->
        <span class="nowtag" style="font-size: 15px"><Pad />Happening now</span>
      {/if}
      <div>
        <time class="t" datetime={machine(now)}>{clock.reading}{#if clock.suffix}<small>{clock.suffix}</small>{/if}</time>
        <time class="d" datetime={campusStartOfDay(now)}>{day}</time>
      </div>
    </div>

    <div class="spacer"></div>

    <div class="org"><Pad tone={mark} />{event?.rso_name}</div>
    <h1>{event?.title}</h1>

    <div class="whenk">
      <div>
        <div class="k">{when.label}</div>
        <time class="big" datetime={machine(when.value)}>{ends.reading}{#if ends.suffix}<small>{ends.suffix}</small>{/if}</time>
      </div>
      <div>
        <div class="k">Room</div>
        <div class="room">{locationLabel(event)}</div>
      </div>
    </div>

    <div class="foot">
      <!--
        docs/design/03-the-look.md: the mark is shown in its own teal on paper or
        on a sky, and in white on the kiosk and the night sky. That is the one
        variation it takes, and the Mark component is where it is drawn.
      -->
      <Mark size={64} onDark />
      <span>{domain}</span>
      {#if rotation}<span>&middot;</span><span>{rotation}</span>{/if}
    </div>
  </div>

  {@render children?.()}
</div>

<style>
  /*
   * The reference mock always draws an event that is running, so its top row
   * never had to hold the clock in the corner on its own. The stage also shows
   * events that have not started, where there is no now tag to push against, and
   * the clock belongs in the corner in either case.
   */
  .k-top > :last-child {
    margin-left: auto;
  }
</style>
