<script>
  import { campusSky } from '../../../campusTime.js';

  /**
   * The sky.
   *
   * The gradient band at the top of every page, coloured by the campus hour:
   * morning gold, afternoon teal, dusk peach, night. It answers the first
   * question an agenda is asked, which is what is on right now, with colour
   * before a single event has been read, and it makes a page opened at eight in
   * the morning feel different from one opened after lab at nine at night.
   *
   * The sky follows the window rather than the theme. Somebody who chose the
   * light theme still gets a dark band at night, with light ink on it, because
   * the band is the site's clock. The page below it stays paper.
   *
   * The band drifts a few pixels a minute, which is the second of the five
   * movements. It holds still for anybody whose system asks for reduced motion,
   * through the rule copied into app.css. See docs/design/04-color.md.
   *
   * It is the only component that knows what time it is, and it reads that from
   * client/src/lib/campusTime.js, the same source the feed uses to decide what is
   * upcoming, so the band and the agenda never disagree about the hour.
   */
  let {
    /**
     * Which sky. Left unset it is the sky over the building right now, and the
     * band crossfades into the next one over the last half hour of this one.
     */
    sky = null,
    /** The instant to read the sky at. */
    at = null,
    /** The band drifts unless it is asked not to. */
    drift = true,
    /** The bottom left corner is cut on the band, at 44 px. */
    cut = 44,
    /** The element to draw. The band at the top of a page is the page's banner. */
    as = 'div',
    class: className = '',
    children,
    ...rest
  } = $props();

  /**
   * The reference stylesheet names the dusk sky --sky-evening. The design
   * documents call it dusk, and so does the greeting, so both names are
   * answered to here rather than in every caller.
   */
  const TOKENS = {
    morning: '--sky-morning',
    afternoon: '--sky-afternoon',
    dusk: '--sky-evening',
    evening: '--sky-evening',
    night: '--sky-night',
  };

  /** What the campus clock says, used whenever a sky has not been named outright. */
  const hour = $derived(campusSky(at ?? new Date()));
  const showing = $derived(sky ?? hour.sky);
  /** A named sky is held, so only a sky read from the clock crossfades. */
  const coming = $derived(sky ? null : hour.next);
  const blend = $derived(sky ? 0 : hour.blend);

  const token = $derived(TOKENS[showing] ?? TOKENS.afternoon);
  const nextToken = $derived(coming ? TOKENS[coming] ?? TOKENS.afternoon : null);

  /**
   * At night the band is dark in either theme, so its ink turns light. It turns
   * at the point the night sky is the one being read rather than at the end of
   * the crossfade, because ink that changed halfway through a fade would be
   * unreadable against both skies at once.
   */
  const night = $derived(showing === 'night' || (coming === 'night' && blend > 0.5));
  const classes = $derived(['skyband', 'cutbl', night && 'night', drift && 'drift', className].filter(Boolean).join(' '));
</script>

<svelte:element this={as} class={classes} style="--cut: {cut}px; --sky: var({token})" {...rest}>
  {#if nextToken && blend > 0}
    <!--
      The two skies are blended into each other at the edges of their hours. The
      one that is coming is laid over the one that is going at the strength the
      clock gives, behind everything the band holds.
    -->
    <span class="coming" style="background: var({nextToken}); opacity: {blend}" aria-hidden="true"></span>
  {/if}
  {@render children?.()}
</svelte:element>

<style>
  .skyband {
    background: var(--sky);
    position: relative;
    overflow: hidden;
  }

  /*
   * The stops move over a background three times the band's height, which reads
   * as a slow breath rather than a scroll.
   */
  /*
   * The band's own children are positioned by the rules copied from the
   * reference stylesheet, so the sky that is coming sits under all of them
   * rather than being given a place in the flow.
   */
  .coming {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .drift {
    background-size: 100% 300%;
    animation: drift 8s ease-in-out infinite alternate;
  }
</style>
