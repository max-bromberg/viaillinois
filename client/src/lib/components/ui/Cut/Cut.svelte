<script>
  /**
   * The cut.
   *
   * A 45 degree chamfer on one corner, taken from the end of the strokes in the
   * mark. It is on the top right of buttons, the toast and the event row, and on
   * the bottom left of the sky band. See docs/design/06-shape-space-motion.md.
   *
   * An outlined cut shape is two chamfered layers rather than one clipped box,
   * because a clipped box loses its border along the diagonal. The outer layer is
   * the border colour and the inner layer is the fill, inset by the border width
   * on every edge; along the diagonal each intercept moves by 0.414 of that
   * width. That arithmetic is in the .ocut rule copied into app.css.
   */
  let {
    /** Which corner is cut. The bottom left belongs to the sky band and the masthead. */
    corner = 'top-right',
    /** How far the chamfer reaches, in pixels. */
    size = 12,
    /** Draw a border that follows the cut, in two layers. */
    outlined = false,
    /** The border colour of an outlined cut. */
    edge = 'var(--ink)',
    /** The fill inside the border of an outlined cut. */
    fill = 'var(--paper)',
    /** The border width of an outlined cut, in pixels. */
    width = 1.5,
    /** The element to draw. A cut is a shape, so it is a div unless told otherwise. */
    as = 'div',
    class: className = '',
    children,
    ...rest
  } = $props();

  const classes = $derived(
    [outlined ? 'ocut' : corner === 'bottom-left' ? 'cutbl' : 'cut', className].filter(Boolean).join(' '),
  );

  const style = $derived(
    [
      `--cut: ${size}px`,
      outlined && `--c: ${size}px`,
      outlined && `--w: ${width}px`,
      outlined && `--oc: ${edge}`,
      outlined && `--ofill: ${fill}`,
    ]
      .filter(Boolean)
      .join('; '),
  );
</script>

<svelte:element this={as} class={classes} {style} {...rest}>
  {@render children?.()}
</svelte:element>
