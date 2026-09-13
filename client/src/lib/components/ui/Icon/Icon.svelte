<script>
  import { ICONS } from './icons.js';

  /**
   * An icon.
   *
   * The stroke, the weight and the caps come from the svg.i rule in the block
   * copied from the reference stylesheet, so an icon is always the colour of the
   * text it sits in and never a colour of its own.
   *
   * An icon never appears without a label. Where a label already sits beside it
   * in the interface the icon is decoration and says so, which is the common
   * case; where it stands alone it is given one here.
   */
  let {
    /** Which shape. */
    name,
    /** What it is called, when it stands alone with no words beside it. */
    label = null,
    /** How large, in pixels. Left alone it takes the size of the type around it. */
    size = null,
    class: className = '',
    ...rest
  } = $props();

  const shape = $derived.by(() => {
    /*
     * Object.hasOwn, because every plain object inherits constructor, toString
     * and the rest from Object.prototype, and a plain lookup takes each of those
     * for a hit and hands back a function to be written into the page.
     */
    if (!Object.hasOwn(ICONS, name)) {
      throw new Error(`there is no ${name} icon; the eight are ${Object.keys(ICONS).join(', ')}`);
    }
    return ICONS[name];
  });
</script>

<svg
  class={['i', className].filter(Boolean).join(' ')}
  viewBox="0 0 24 24"
  style={size ? `font-size: ${size}px` : undefined}
  role={label ? 'img' : undefined}
  aria-hidden={label ? undefined : 'true'}
  {...rest}
>{#if label}<title>{label}</title>{/if}{@html shape}</svg>
