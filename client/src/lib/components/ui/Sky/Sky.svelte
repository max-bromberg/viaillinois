<script>
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
   */
  let {
    /** Which sky. The campus hour chooses it; see client/src/lib/campusTime.js. */
    sky = 'afternoon',
    /** The band drifts unless it is asked not to. */
    drift = true,
    /** The bottom left corner is cut on the band, at 44 px. */
    cut = 44,
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

  const token = $derived(TOKENS[sky] ?? TOKENS.afternoon);
  /** At night the band is dark in either theme, so its ink turns light. */
  const night = $derived(sky === 'night');
  const classes = $derived(['skyband', 'cutbl', night && 'night', drift && 'drift', className].filter(Boolean).join(' '));
</script>

<div class={classes} style="--cut: {cut}px; --sky: var({token})" {...rest}>
  {@render children?.()}
</div>

<style>
  .skyband {
    background: var(--sky);
    position: relative;
    overflow: hidden;
  }

  /*
   * The night sky is dark whichever theme the page is in, so the band takes the
   * light ink. The page below the band is untouched.
   */
  .night {
    color: #e6f0f0;
    --sky-ink: #e6f0f0;
    --ink: #e6f0f0;
    --ink-2: #c3d3d3;
    --muted: #8fa8a8;
  }

  /*
   * The stops move over a background three times the band's height, which reads
   * as a slow breath rather than a scroll.
   */
  .drift {
    background-size: 100% 300%;
    animation: drift 8s ease-in-out infinite alternate;
  }
</style>
