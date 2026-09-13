<script>
  /**
   * The highlighter.
   *
   * A word with a stroke of colour under its lower half, skewed and rotated a
   * little, the way a marker lands on a printed schedule. It is how a tag and a
   * status are drawn, because the site has no filled pills and no coloured bars.
   * See docs/design/07-components.md.
   *
   * A tag is drawn on a row or on paper and never in a well. The stroke is the
   * strictest background the word has, and the eight hues clear the contrast
   * threshold on a row and on paper but not that far down; the one well surface
   * in the agenda is a cancelled row, which carries a status and no tags.
   */
  let {
    /** The hue, one of the eight, or a status colour. */
    tone = 'var(--primary)',
    /** Unselected: the word in muted, over a dotted hairline rather than a stroke. */
    off = false,
    /**
     * A tag filter is a toggle and says so. Left undefined the highlight is a
     * plain span, which is what a status is.
     */
    pressed = undefined,
    /** What happens when a toggle is pressed. */
    onclick = undefined,
    class: className = '',
    children,
    ...rest
  } = $props();

  const toggle = $derived(pressed !== undefined || onclick !== undefined);
  const classes = $derived(['hl', off && 'off', className].filter(Boolean).join(' '));
</script>

{#if toggle}
  <button
    type="button"
    class={classes}
    style="--h: {tone}"
    aria-pressed={pressed === undefined ? undefined : String(pressed)}
    {onclick}
    {...rest}
  >{@render children?.()}</button>
{:else}
  <span class={classes} style="--h: {tone}" {...rest}>{@render children?.()}</span>
{/if}

<style>
  /* A toggle is a button, and a button brings a look of its own that is not wanted. */
  button {
    font: inherit;
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
  }
</style>
