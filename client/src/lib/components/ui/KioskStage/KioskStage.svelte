<script>
  import { Mark } from '../Mark/index.js';
  import { Pad } from '../Pad/index.js';
  import { Qr } from '../Qr/index.js';
  import { campusDate, campusDayName, campusStartOfDay, campusTime, toInstant } from '../../../campusTime.js';
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
    /** The forecast, or nothing. A screen that cannot reach it still shows events. */
    weather = null,
    /** Where this event's own page is, which the code on the slide carries. */
    eventUrl = null,
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
   * The event's own date, said in figures beside the word.
   *
   * "Tomorrow" is the reading somebody walking past wants, and it is also the
   * one word on the slide that means something different depending on when you
   * read it. The date beside it settles that for anybody who is unsure.
   */
  const eventDate = $derived(
    event?.start_time
      ? campusDate(event.start_time, { month: 'short', day: 'numeric' })
      : null,
  );

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

  /**
   * Until the event ends once it has begun, and when it starts until then.
   * "Until 8:00 PM" on an event that has not started is a lie a lobby screen
   * tells all afternoon, and the person reading it is walking past.
   */
  const started = $derived.by(() => {
    const start = toInstant(event?.start_time);
    const hour = toInstant(now);
    return Boolean(start && hour && hour >= start);
  });

  const when = $derived(
    started && event?.end_time
      ? { label: 'Until', value: event.end_time }
      : { label: 'Starts', value: event?.start_time },
  );
  const ends = $derived(clockParts(when.value));

  /**
   * Which day the event is on, said only when that is not today, because a lobby
   * screen showing what is next can be showing something three days out.
   */
  const eventDay = $derived(campusDayName(event?.start_time, now));
  const onAnotherDay = $derived(
    Boolean(event?.start_time) && campusStartOfDay(event.start_time) !== campusStartOfDay(now),
  );

  /** The kiosk is dark in either theme, so the mark takes its dark reading. */
  const mark = $derived(organizationColor(event?.logo_color, 'mark', 'dark'));

  /** One of one is the whole rotation, and saying so tells nobody anything. */
  const rotation = $derived(position && count && count > 1 ? `${position} of ${count}` : null);
</script>

<div class={['kiosk', className].filter(Boolean).join(' ')} {...rest}>
  <div class="main">
    {@render board?.()}

    <div class="k-top">
      <!--
        The mark leads the screen rather than signing off at the bottom of it.
        A lobby display is read from across a room and from the top down, so the
        thing that says whose screen this is belongs where the eye lands first.
      -->
      <div class="brand">
        <Mark size={72} onDark />
        <div class="brandsaid">
          <span>{domain}</span>
          {#if rotation}<span class="rot">{rotation}</span>{/if}
        </div>
      </div>

      {#if live}
        <!--
          A live event says so in words. The pad beside it breathes through the
          .nowtag rule in app.css, and the reference sets this one instance a
          little larger than the tag takes elsewhere.
        -->
        <span class="nowtag" style="font-size: 18px"><Pad />Happening now</span>
      {/if}

      <div class="clockstack">
        <time class="t" datetime={machine(now)}>{clock.reading}{#if clock.suffix}<small>{clock.suffix}</small>{/if}</time>
        <time class="d" datetime={campusStartOfDay(now)}>{day}</time>
        {#if weather?.now}
          <div class="wx">
            <span class="deg">{weather.now.temperature}&deg;</span>
            <span class="sky">{weather.now.summary}</span>
            {#if weather.days?.length}
              <span class="soon">
                {#each weather.days.slice(1, 3) as ahead (ahead.name)}
                  <span>{ahead.name.slice(0, 3)} {ahead.temperature}&deg;</span>
                {/each}
              </span>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="spacer"></div>

    <div class="org"><Pad tone={mark} />{event?.rso_name}</div>
    <h1>{event?.title}</h1>
    {#if onAnotherDay}
      <!--
        The stage shows what is next, which is not always what is on today. The
        day of the event is the one thing the rail says about everything it lists
        and the stage could not say about the event it is showing, so somebody
        walking past read a time with no date on it.
      -->
      <time class="onday" datetime={campusStartOfDay(event?.start_time)}>
        {eventDay}{#if eventDate}<small>{eventDate}</small>{/if}
      </time>
    {/if}

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

    {#if eventUrl}
      <!--
        Every event the screen shows is public and still going ahead, because
        the listing behind the kiosk excludes anything internal or cancelled, so
        every slide has a page worth landing on and every slide gets a code.
      -->
      <div class="code">
        <Qr value={eventUrl} size={156} label="Open this event" />
      </div>
    {/if}
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
  /*
   * The day sits under the title in the display face, large enough to read
   * while walking past but well under the title it qualifies.
   */
  /*
   * The word is what somebody walking past reads, and it is also the one word
   * on the slide whose meaning depends on when it is read. The figures beside
   * it settle that, set smaller and quieter so they qualify the word rather
   * than competing with it.
   */
  .onday {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-top: 16px;
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 700;
    font-size: 34px;
    color: var(--ink-2);
  }

  .onday small {
    font-family: var(--mono);
    font-size: 20px;
    font-weight: 400;
    color: var(--muted);
  }

  .k-top > :last-child {
    margin-left: auto;
  }

  /* The mark leads the screen, so the row it is in starts with it. */
  .brand {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .brandsaid {
    display: grid;
    gap: 2px;
    font-family: var(--mono);
    font-size: 15px;
    color: var(--muted);
  }

  .brandsaid .rot {
    font-size: 13px;
    /* The colour document keeps the faint grey for hairlines and hollow pads,
       never for words, and on the board it measured 3.42 to 1. */
    color: var(--muted);
  }

  .clockstack {
    display: grid;
    justify-items: end;
  }

  /*
   * The forecast under the clock, at the size the rest of the corner is read
   * at. It is left out entirely when no source could be reached, because a
   * lobby screen with an empty weather panel on it looks broken and a lobby
   * screen with no weather panel looks finished.
   */
  .wx {
    margin-top: 18px;
    display: grid;
    justify-items: end;
    gap: 4px;
  }

  .wx .deg {
    font-family: var(--display);
    font-stretch: 75%;
    font-weight: 700;
    font-size: 40px;
    line-height: 1;
    color: #e6f0f0;
  }

  .wx .sky {
    font-family: var(--display);
    font-stretch: 85%;
    font-weight: 600;
    font-size: 17px;
    color: var(--ink-2);
  }

  .wx .soon {
    display: flex;
    gap: 14px;
    font-family: var(--mono);
    font-size: 14px;
    color: var(--muted);
    margin-top: 2px;
  }

  /*
   * The code sits where the sign off used to, at the foot of the stage and
   * clear of the rail, so a phone held up to it is not held over the listing.
   */
  /*
   * The code sits in the corner the composition already leaves empty, rather
   * than under the title where a white tile is the brightest thing on a dark
   * screen and pulls the eye off the event. It is clear of the rail, so a phone
   * held up to it covers nothing anybody else is reading.
   */
  .code {
    position: absolute;
    right: 60px;
    bottom: 40px;
    z-index: 2;
  }
</style>
