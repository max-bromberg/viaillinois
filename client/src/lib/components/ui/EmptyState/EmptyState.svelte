<script>
  /**
   * An empty state.
   *
   * The dusk sky as a surface, cut at 22 pixels, with a line in the condensed
   * display face and a sentence under it in secondary ink. It says what is
   * nearby and what to do, rather than reporting that a query returned nothing:
   * "Nothing on tonight. Thursday has two events and Friday has the Texas
   * Instruments session. If you expected more here, clear a tag or two."
   *
   * See docs/design/07-components.md and docs/design/10-voice.md.
   */
  let {
    /** The first line, which says what is here. */
    lead,
    /** The sentence under it, which says what is nearby and what to do. */
    say = null,
    class: className = '',
    children,
    ...rest
  } = $props();
</script>

<div class={['empty', 'cut', className].filter(Boolean).join(' ')} style="--cut: 22px" {...rest}>
  <b>{lead}</b>
  {#if say}<p>{say}</p>{/if}
  {@render children?.()}
</div>
