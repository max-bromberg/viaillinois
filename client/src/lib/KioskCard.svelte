<script>
  import { KioskStage, KioskRail } from './components/ui/index.js';
  import CircuitBackground from './CircuitBackground.svelte';
  import { toInstant } from './campusTime.js';

  /**
   * One screen of the lobby display.
   *
   * The stage and the rail, drawn on the night sky as the whole screen with the
   * circuit board behind them. The kiosk is the night sky whatever the hour,
   * because the lobby screen is the one place the board should be visible at
   * full strength. See docs/design/08-surfaces.md and the kiosk block of
   * docs/design/foundation.html, which is the acceptance render.
   *
   * The card draws one event. The rotation, the listing behind it and the
   * minute by minute refresh belong to the surface, which is
   * client/src/routes/Kiosk.svelte.
   */
  let {
    /** The event on screen. */
    event,
    /** What is on after it, which the rail lists. */
    next = [],
    /** This month's midterms, which the rail lists under them. */
    midterms = [],
    /** The hour it is now on campus, which the clock reads. */
    now = new Date(),
    /** Which event of the rotation this is, counting from one. */
    position = null,
    /** How many events the rotation holds. */
    count = null,
  } = $props();



  /**
   * docs/design/08-surfaces.md: the crossfade between events is the settle
   * movement applied to the title block. The stage itself is never torn down
   * between events, because the board behind it would be generated again every
   * eight seconds, and a CSS animation only runs a second time when its name
   * changes. So the movement carries two names and the rotation alternates
   * between them.
   */
  const turn = $derived(position % 2 === 0 ? 'turn-b' : 'turn-a');
</script>

<KioskStage {event} {now} {position} {count} class={turn}>
  {#snippet board()}
    <CircuitBackground />
  {/snippet}
  <KioskRail {next} {midterms} {now} />
</KioskStage>

<style>
  /*
   * The board wears a mask on a reading page, so that it is something noticed
   * at the edges rather than read through. The lobby screen is the one place it
   * is meant to be seen at full strength, so the mask comes off. The rule has
   * to be global and to carry a weight, because the mask is written on the
   * canvas element itself.
   */
  :global(.kiosk canvas) {
    -webkit-mask-image: none !important;
    mask-image: none !important;
  }

  /* The settle movement, under the two names the rotation alternates between. */
  :global(.kiosk.turn-a .org),
  :global(.kiosk.turn-a h1),
  :global(.kiosk.turn-a .whenk) {
    animation: turn-a 0.6s ease-out both;
  }

  :global(.kiosk.turn-b .org),
  :global(.kiosk.turn-b h1),
  :global(.kiosk.turn-b .whenk) {
    animation: turn-b 0.6s ease-out both;
  }

  @keyframes -global-turn-a {
    from { transform: translateY(8px); }
    to   { transform: translateY(0); }
  }

  @keyframes -global-turn-b {
    from { transform: translateY(8px); }
    to   { transform: translateY(0); }
  }
</style>
