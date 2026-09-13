<script>
  /**
   * The lamp.
   *
   * An organization's colour falling across a surface from its top left corner
   * and fading out before it reaches the other side. It is how the site says
   * which organization a row belongs to without a stripe, a bar or a filled
   * pill, and it is why colour on VIA always arrives from somewhere.
   *
   * The strengths are tokens, because the colour document gives one per theme
   * and per state and a component that carried the numbers itself would drift.
   * See docs/design/04-color.md.
   */
  let {
    /** The organization's adapted lamp colour. */
    tone = 'var(--primary)',
    /** How wide the light falls, in pixels. A row takes 560, the event page 900. */
    width = 560,
    /** How far down it falls, in pixels. A row takes 200, the event page 520. */
    height = 200,
    /** How far across the surface it has faded out, as a percentage. */
    fade = 72,
    /** The surface it falls on. */
    surface = 'var(--card)',
    /** The strength at rest. */
    strength = 'var(--lamp)',
    /**
     * Brighten under a cursor or a keyboard, which is the raised level of
     * elevation: the lamp brightens, nothing lifts and nothing gains a shadow.
     */
    reactive = false,
    /** The element to draw. */
    as = 'div',
    class: className = '',
    children,
    ...rest
  } = $props();

  const classes = $derived(['lamp', reactive && 'reactive', className].filter(Boolean).join(' '));

  const style = $derived(
    [
      `--h: ${tone}`,
      `--lamp-width: ${width}px`,
      `--lamp-height: ${height}px`,
      `--lamp-fade: ${fade}%`,
      `--lamp-surface: ${surface}`,
      `--lamp-strength: ${strength}`,
    ].join('; '),
  );
</script>

<svelte:element this={as} class={classes} {style} {...rest}>
  {@render children?.()}
</svelte:element>

<style>
  .lamp {
    background: radial-gradient(
      var(--lamp-width) var(--lamp-height) at 0% 0%,
      color-mix(in srgb, var(--h) var(--lamp-now, var(--lamp-strength)), var(--lamp-surface)),
      var(--lamp-surface) var(--lamp-fade)
    );
    /* The one transition the design permits on a row, at the length it gives. */
    transition: background 200ms ease;
  }

  .reactive:hover,
  .reactive:focus-within {
    --lamp-now: var(--lamp-hover);
  }
</style>
