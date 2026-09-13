<script>
  import { onMount, onDestroy } from 'svelte';
  import { getKioskEvents } from '../api/events.js';
  import { getConfirmedMidterms } from '../api/midterms.js';
  import { getRsos } from '../api/rsos.js';
  import KioskCard from '../lib/KioskCard.svelte';
  import KioskCardSkeleton from '../lib/KioskCardSkeleton.svelte';
  import CircuitBackground from '../lib/CircuitBackground.svelte';
  import { Mark } from '../lib/components/ui/index.js';
  import { campusFields } from '../lib/campusTime.js';

  /**
   * The kiosk.
   *
   * A full screen rotating display for a building lobby. It is the night sky
   * whatever the hour, because this is the one place the board should be
   * visible at full strength, and it is drawn outside the application shell:
   * there is no sky band, no navigation and no footer, only the screen. See
   * docs/design/08-surfaces.md and the kiosk block of
   * docs/design/foundation.html, which is the acceptance render.
   */

  /** Eight seconds on each event. */
  const ROTATE_MS = 8000;
  /** A fresh reading of the listing every minute. */
  const REFRESH_MS = 60000;

  /** How many events and midterms the rail lists, which is what its column fits. */
  const RAIL_EVENTS = 5;
  const RAIL_MIDTERMS = 2;

  /** How many events the rotation asks for. */
  const ROTATION_LENGTH = 20;

  let events = $state([]);
  let midterms = $state([]);
  /** The colour each organization chose, by name, because the listing carries none. */
  let colours = $state({});
  let at = $state(0);
  let initialLoading = $state(true);

  /**
   * The hour on the wall. The lobby has no clock of its own, so the screen
   * carries one, and it is moved on with the rotation rather than by an
   * interval of its own: eight seconds is closer than anybody walking past a
   * lobby screen can read.
   */
  let now = $state(new Date());

  let rotating;
  let refreshing;

  async function fetchEvents() {
    try {
      const { events: listed } = await getKioskEvents(ROTATION_LENGTH);
      events = listed ?? [];
      if (at >= events.length) at = 0;
    } catch {
      // A screen that has been running for a week keeps showing what it has
      // rather than emptying itself because one request did not come back.
    }
  }

  async function fetchMidterms() {
    try {
      const { midterms: confirmed } = await getConfirmedMidterms();
      midterms = confirmed ?? [];
    } catch {
      // The midterm schedule is the foot of the rail, not the screen.
    }
  }

  async function fetchColours() {
    try {
      const { rsos } = await getRsos();
      colours = Object.fromEntries((rsos ?? []).map(rso => [rso.name, rso.logo_color ?? null]));
    } catch {
      colours = {};
    }
  }

  /**
   * The kiosk listing carries no colour, so each event is given the one its
   * organization chose. It is adapted before it is drawn, which the stage does.
   */
  const coloured = $derived(
    events.map(event => ({ ...event, logo_color: colours[event.rso_name] ?? null })),
  );

  const showing = $derived(coloured[at] ?? null);

  /**
   * What the rail lists: the events after the one on the stage, wrapping round
   * to the start of the rotation, because the rotation wraps too.
   */
  const next = $derived(
    [...coloured.slice(at + 1), ...coloured.slice(0, at)].slice(0, RAIL_EVENTS),
  );

  /**
   * This month's midterms, from today onward. An exam that has already been sat
   * is not what a student passing a lobby screen in October has come to find.
   */
  const thisMonth = $derived.by(() => {
    const today = campusFields(now);
    if (!today) return [];
    return midterms
      .filter(exam => {
        const when = campusFields(exam.start_time);
        return when && when.year === today.year && when.month === today.month && when.day >= today.day;
      })
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
      .slice(0, RAIL_MIDTERMS);
  });

  onMount(async () => {
    fetchColours();
    await Promise.all([fetchEvents(), fetchMidterms()]);
    initialLoading = false;

    rotating = setInterval(() => {
      now = new Date();
      at = (at + 1) % Math.max(events.length, 1);
    }, ROTATE_MS);

    refreshing = setInterval(() => {
      fetchEvents();
      fetchMidterms();
    }, REFRESH_MS);
  });

  onDestroy(() => {
    clearInterval(rotating);
    clearInterval(refreshing);
  });
</script>

<svelte:head>
  <title>Kiosk: VIA</title>
  <style>body { overflow: hidden; }</style>
</svelte:head>

<div class="screen">
  {#if initialLoading}
    <KioskCardSkeleton />
  {:else if showing === null}
    <!--
      The lobby screen still says something when the feed has nothing on it, and
      what it says is where the rest of the week is. It keeps the night sky and
      the board, because a lobby walking past a white page with a sentence on it
      reads as a display that has broken.
    -->
    <div class="kiosk alone">
      <div class="main">
        <CircuitBackground />
        <div class="spacer"></div>
        <h1>Nothing is coming up.</h1>
        <p>
          Every ECE organization's events are on the feed at viaillinois.com, and
          anything filed there is on this screen within the minute.
        </p>
        <div class="foot">
          <Mark size={64} onDark />
          <span>viaillinois.com</span>
        </div>
      </div>
    </div>
  {:else}
    <KioskCard
      event={showing}
      {next}
      midterms={thisMonth}
      {now}
      position={at + 1}
      count={events.length}
    />
  {/if}
</div>

<style>
  /*
   * The reference render draws the kiosk as a sixteen by nine slab inside a
   * page, because that is how a mock is shown. Here it is the screen, so the
   * aspect ratio comes off and it takes the whole window.
   */
  .screen {
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }

  .screen :global(.kiosk) {
    aspect-ratio: auto;
    width: 100%;
    height: 100%;
  }

  /*
   * With nothing to show there is no rail, so the stage has the screen to
   * itself rather than leaving a 360 pixel column of darker ground beside it.
   */
  .kiosk.alone {
    grid-template-columns: 1fr;
  }

  .screen p {
    margin: 18px 0 0;
    color: var(--ink-2);
    font-size: 20px;
    line-height: 1.5;
    max-width: 44ch;
  }
</style>
