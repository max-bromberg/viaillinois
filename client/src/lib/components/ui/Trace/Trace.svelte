<script>
  /**
   * The trace.
   *
   * A line that turns at 45 degrees and ends in a pad, drawn from the circuit
   * board that has always sat behind the site. It is the only ornament the
   * system permits, because it is also the mark's own geometry: drawn thinly in
   * teal, with one pad in signal where a signal is live.
   *
   * docs/design/03-the-look.md puts it in four places and no others: the
   * masthead, the sky band, the sky tiles and the empty state. It is also the
   * board that lights up on the kiosk, which client/src/lib/CircuitBackground.svelte
   * draws on a canvas because that one is the whole screen.
   */
  let {
    /** How wide, in pixels. */
    width = 420,
    /** How strongly it shows. The band draws it faintly. */
    opacity = 0.35,
    class: className = '',
    ...rest
  } = $props();
</script>

<svg
  class={['deco', className].filter(Boolean).join(' ')}
  viewBox="0 0 640 220"
  width={width}
  fill="none"
  stroke="var(--primary)"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  style="opacity: {opacity}"
  aria-hidden="true"
  {...rest}
>
  <path d="M0 80h140l60 60h160l40 40h240" />
  <path d="M60 160h110l50-50h90" />
  <path d="M260 30h120l60 60h200" />
  <circle cx="140" cy="80" r="4" fill="var(--primary)" />
  <circle cx="360" cy="140" r="4" fill="var(--primary)" />
  <circle cx="170" cy="160" r="4" fill="var(--primary)" />
  <!-- One pad in signal, where the board is live. -->
  <circle cx="440" cy="90" r="4" fill="var(--signal)" stroke="var(--signal)" />
</svg>
