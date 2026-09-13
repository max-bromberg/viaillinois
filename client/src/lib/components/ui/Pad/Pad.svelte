<script>
  /**
   * The pad.
   *
   * A small square rotated 45 degrees, taken from the ends of the strokes in the
   * mark. It is the checkbox, the organization mark, the thumb of the switch,
   * the needle of the theme dial, the marker at the start of a field, the marker
   * under the active page in the navigation, and the marker beside each day in
   * the agenda. See docs/design/07-components.md.
   *
   * The shape, the three states and the pulse are in the block copied from the
   * reference stylesheet into app.css. What is here is the choice of state, the
   * hit target a control needs, and what a screen reader is told.
   */
  let {
    /** The colour the pad is drawn in. The stylesheet falls back to the primary colour. */
    tone = null,
    /** Off: transparent with a border, rather than filled. */
    hollow = false,
    /** Live: filled, with a soft halo. */
    lit = false,
    /** Live and pulsing. A breathing pad is lit, so this implies it. */
    breathing = false,
    /** How slowly it breathes. The row pad takes 1.6s and the day pad 2s. */
    pace = null,
    /** A control sits inside a 32 px target with 12 px of ink. */
    control = false,
    /** What a screen reader should call it. Without one it is decoration. */
    label = null,
    class: className = '',
    ...rest
  } = $props();

  const classes = $derived(
    ['pad', (lit || breathing) && 'lit', hollow && 'hollow', breathing && 'breathing', control && 'control', className]
      .filter(Boolean)
      .join(' '),
  );

  const style = $derived(
    [tone && `--h: ${tone}`, pace && `--pace: ${pace}`].filter(Boolean).join('; ') || undefined,
  );
</script>

<span
  class={classes}
  {style}
  role={label ? 'img' : undefined}
  aria-label={label ?? undefined}
  aria-hidden={label ? undefined : 'true'}
  {...rest}
></span>

<style>
  /* Lit, and pulsing, which is the one thing that says this is happening now. */
  .breathing {
    animation: pulse var(--pace, 1.6s) ease-in-out infinite;
  }

  /*
   * A control is 12 px of ink inside a 32 px target, which is what a hand can
   * hit. The ink stays the size it is; the target is drawn around it.
   */
  .control {
    width: 12px;
    height: 12px;
    box-sizing: content-box;
    padding: 10px;
    margin: -10px;
  }
</style>
