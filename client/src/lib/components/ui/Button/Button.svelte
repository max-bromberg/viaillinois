<script>
  import { Pad } from '../Pad/index.js';
  import { Icon } from '../Icon/index.js';

  /**
   * A button.
   *
   * Set in the display face at width 85, weight 700, cut at the top right. An
   * outlined button is two chamfered layers, a border layer and a fill layer
   * inset by the border width on every edge including the diagonal, because a
   * clipped box loses its border where the corner is taken off. Focus thickens
   * the border layer to three pixels of primary, which gives the ring the shape
   * of the button rather than a rectangle around it.
   *
   * A control says exactly what happens: "Schedule an event", "Copy link",
   * "Cancel event". There is one primary button on a screen.
   *
   * See docs/design/07-components.md.
   */
  let {
    /** primary, secondary, quiet or danger. */
    variant = 'secondary',
    /** The small size takes a smaller cut to match. */
    size = 'md',
    /** Somewhere to go, which makes this a link that looks like a button. */
    href = null,
    /** An icon beside the label. The label speaks, so the icon is decoration. */
    icon = null,
    /**
     * An icon after the label rather than before it. A control that says which
     * way it goes wants its chevron on the side it points: a chevron in front
     * of "Next week" points back at the words.
     */
    trailingIcon = null,
    /** Waiting on something. The button says so and stops answering. */
    busy = false,
    disabled = false,
    type = 'button',
    /**
     * What the button is standing on. A secondary or danger button fills with
     * the surface under it, and paper and a card are different colours.
     */
    on = 'paper',
    /** What happens when it is pressed. */
    onclick = undefined,
    class: className = '',
    children,
    ...rest
  } = $props();

  /** The quiet variant is the one with no fill, so it is the one with no cut. */
  const cut = $derived(variant !== 'quiet');

  const classes = $derived(
    ['btn', variant, cut && 'cut', size === 'sm' && 'sm', className].filter(Boolean).join(' '),
  );

  const stopped = $derived(disabled || busy);

  /**
   * A link cannot be disabled, and a button that is waiting on something should
   * not answer a second time, so the guard is here rather than left to the
   * element. Without it, pressing "Schedule an event" twice while the first
   * press was still in flight filed the event twice.
   */
  function press(event) {
    if (stopped) {
      event.preventDefault();
      return;
    }
    onclick?.(event);
  }
</script>

<!--
  The fill of an outlined button is the surface it stands on, and the stylesheet
  reads that from an ancestor rather than from the button, so the wrapper is
  where it is said.
-->
<span class="holder" class:on-card={on === 'card'}>
  {#if href}
    <a
      {href}
      class={classes}
      aria-busy={busy ? 'true' : undefined}
      aria-disabled={stopped ? 'true' : undefined}
      onclick={press}
      {...rest}
    >
      {#if variant === 'quiet' && !icon && !trailingIcon}<Pad />{/if}
      {#if icon}<Icon name={icon} />{/if}
      {@render children?.()}
      {#if trailingIcon}<Icon name={trailingIcon} />{/if}
    </a>
  {:else}
    <button
      {type}
      class={classes}
      disabled={stopped}
      aria-busy={busy ? 'true' : undefined}
      onclick={press}
      {...rest}
    >
      {#if variant === 'quiet' && !icon && !trailingIcon}<Pad />{/if}
      {#if icon}<Icon name={icon} />{/if}
      {@render children?.()}
      {#if trailingIcon}<Icon name={trailingIcon} />{/if}
    </button>
  {/if}
</span>

<style>
  /* The wrapper only carries the surface, so it takes no room of its own. */
  .holder {
    display: contents;
  }

  a.btn {
    text-decoration: none;
  }

  /* A stopped button is still legible; it just does not answer. */
  .btn:disabled {
    cursor: default;
    opacity: 0.55;
  }
</style>
