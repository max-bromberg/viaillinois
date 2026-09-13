<script>
  /**
   * A numeral.
   *
   * A count, a time or a course code set large in the condensed display face and
   * followed by its meaning in words, as one phrase: "2 tonight in ECEB", "12
   * this week". There is never a tile with a number in it, and the number and
   * its meaning never separate. See docs/design/03-the-look.md.
   */
  let {
    /** The number itself. */
    value,
    /** What it means, in words, which travels with it. */
    unit = '',
    /**
     * Orange, which is spent only on what is happening now or next. Nothing else
     * on a screen may use it.
     */
    hot = false,
    /** The size of the number in pixels. The greeting line sets 30, the type page 64. */
    size = 30,
    class: className = '',
    ...rest
  } = $props();

  const classes = $derived(['numeral', className].filter(Boolean).join(' '));
</script>

<span class={classes} {...rest}>
  <b class:hot style="font-size: {size}px">{value}</b>{#if unit}<span class="unit">{unit}</span>{/if}
</span>

<style>
  .numeral {
    display: inline;
  }

  /* Condensed 800, with the positive tracking the display face takes. */
  b {
    font-family: var(--display);
    font-stretch: 75%;
    font-variation-settings: "opsz" 96;
    font-weight: 800;
    line-height: 1;
    letter-spacing: 0.006em;
    margin-right: 5px;
    color: var(--ink);
  }

  .hot {
    color: var(--signal-text);
  }

  /* The meaning sits on the same baseline, in the reading face. */
  .unit {
    font-family: var(--sans);
    font-size: 15px;
    font-weight: 400;
    color: inherit;
  }
</style>
