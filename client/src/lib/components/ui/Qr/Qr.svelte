<script>
  import QRCode from 'qrcode';

  /**
   * A code somebody photographs off a screen.
   *
   * It is drawn from the module matrix rather than dropped in as an image, so
   * that it takes the design's own colours and the chamfer the rest of the page
   * carries. A generic black square on a VIA screen would be the one element on
   * it belonging to nothing.
   *
   * Two things here are not design choices. The quiet margin has to be there or
   * a camera cannot find the code's edge, and the modules run dark on a light
   * field, because that is what every reader is built to expect and a lobby is
   * not a controlled light. The chamfer is taken out of the field's corner
   * rather than out of the code, so nothing the reader needs is ever clipped.
   */
  let {
    /** The address the code carries. */
    value = '',
    /** How large the tile is drawn, in pixels. */
    size = 148,
    /** What the code is for, said in words beside it. */
    label = null,
    class: className = '',
    ...rest
  } = $props();

  /** The quiet zone, in modules. Four is the specification's own number. */
  const MARGIN = 4;

  /**
   * The matrix, or nothing.
   *
   * An address that cannot be encoded is drawn as nothing rather than as an
   * empty frame: a slide with no code on it reads as a slide, and a slide with
   * a blank white square on it reads as a fault.
   */
  const matrix = $derived.by(() => {
    if (!value) return null;
    try {
      const { modules } = QRCode.create(String(value), { errorCorrectionLevel: 'H' });
      return { size: modules.size, data: modules.data };
    } catch {
      return null;
    }
  });

  const span = $derived(matrix ? matrix.size + MARGIN * 2 : 0);

  /** Every dark module, as a square placed on the matrix's own grid. */
  const squares = $derived.by(() => {
    if (!matrix) return [];
    const out = [];
    for (let row = 0; row < matrix.size; row += 1) {
      for (let column = 0; column < matrix.size; column += 1) {
        if (matrix.data[row * matrix.size + column]) {
          out.push({ x: column + MARGIN, y: row + MARGIN });
        }
      }
    }
    return out;
  });
</script>

{#if matrix}
  <div class={['qrtile', className].filter(Boolean).join(' ')} {...rest}>
    <svg
      class="qrcode"
      viewBox="0 0 {span} {span}"
      width={size}
      height={size}
      role="img"
      shape-rendering="crispEdges"
    >
      <title>{value}</title>
      <rect class="field" x="0" y="0" width={span} height={span} fill="#ffffff" />
      {#each squares as square (`${square.x}-${square.y}`)}
        <rect class="m" x={square.x} y={square.y} width="1" height="1" fill="#0b1a1b" />
      {/each}
    </svg>
    {#if label}<span class="said">{label}</span>{/if}
  </div>
{/if}

<style>
  /*
   * The tile takes the chamfer out of its own corner rather than out of the
   * code, so the quiet margin and every module stay whole. The cut is the same
   * 45 degrees every other cut on the site takes.
   */
  .qrtile {
    display: inline-grid;
    justify-items: center;
    gap: 10px;
  }

  .qrcode {
    display: block;
    background: #ffffff;
    padding: 0;
    clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%);
  }

  .said {
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 700;
    font-size: 15px;
    color: var(--muted);
    text-align: center;
    max-width: 14ch;
    line-height: 1.2;
  }
</style>
