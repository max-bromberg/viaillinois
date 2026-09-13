<script>
  /**
   * The mark.
   *
   * Three angled strokes in teal with rounded ends, the middle one reading as a
   * V, an I and an A at once. Its 45 degree geometry supplies every shape the
   * site draws: the cut, the pad and the trace are all taken from it.
   *
   * docs/design/03-the-look.md: the mark is never recolored, outlined, rotated
   * or placed inside a container. The one variation it takes is white, on the
   * kiosk and on the night sky, where its own teal would disappear.
   */
  let {
    /** How wide, in pixels. The mark keeps its own proportions. */
    size = 58,
    /** Draw it in white, which is only for the kiosk and the night sky. */
    onDark = false,
    /** What it is called. It is the site's name, so it says so. */
    label = 'VIA',
    class: className = '',
    ...rest
  } = $props();
</script>

<svg
  class={['mark', className].filter(Boolean).join(' ')}
  viewBox="0 0 1060 476"
  width={size}
  height={(size * 476) / 1060}
  role="img"
  aria-label={label}
  fill={onDark ? '#ffffff' : 'var(--mark)'}
  {...rest}
>
  <path d="M0.012,413.969l-0.012,0l0,-413.969l61.438,0c34.367,0 62.227,27.86 62.227,62.227l-0,202.465c0,0 187.198,-187.198 246.738,-246.738c11.496,-11.496 27.087,-17.954 43.344,-17.954c0,0 61.833,-0 61.833,-0l0,56.153c1.563,17.1 -3.963,34.728 -16.579,48.092l-353.447,353.447c-24.131,24.131 -63.314,24.131 -87.444,0c-12.065,-12.065 -18.098,-27.894 -18.098,-43.722Z" />
  <path d="M1059.922,61.82l0.012,0l0,413.969l-61.438,0c-34.367,-0 -62.227,-27.86 -62.227,-62.227c0,-78.245 0,-202.465 0,-202.465c-0,-0 -187.198,187.198 -246.738,246.738c-11.496,11.496 -27.087,17.954 -43.344,17.954c-0,-0 -61.833,0 -61.833,0l-0,-56.153c-1.563,-17.1 3.963,-34.728 16.579,-48.092l353.447,-353.447c24.131,-24.131 63.314,-24.131 87.444,0c12.065,12.065 18.098,27.894 18.098,43.722Z" />
  <path d="M402.571,457.691c-24.131,24.131 -63.314,24.131 -87.444,0c-24.131,-24.131 -24.131,-63.314 0,-87.444c0,0 278.19,-278.19 352.293,-352.293c11.496,-11.496 27.087,-17.954 43.344,-17.954c0,0 61.833,-0 61.833,-0l0,56.153c1.563,17.1 -3.963,34.728 -16.579,48.092l-353.447,353.447Z" />
</svg>

<style>
  .mark {
    display: block;
  }
</style>
