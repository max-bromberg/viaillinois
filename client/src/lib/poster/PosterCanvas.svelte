<script>
  import { drawPoster, textHeights } from './draw.js';
  import { moveLayer, resizeLayer } from './document.js';

  /**
   * The poster, and the handles over it.
   *
   * The canvas underneath is the poster itself, drawn by the one function that
   * also draws the file a board downloads, so what is on the screen is what
   * arrives in the download. Over it sits a layer of ordinary buttons, one per
   * layer, and the handles of whichever is selected.
   *
   * Everything a person grabs is a real element rather than a shape the canvas
   * hit tests, so a layer can be reached with the Tab key, moved with the arrow
   * keys and named to a screen reader, none of which a canvas can do for
   * itself. It also means the browser decides what was clicked, including for
   * a layer that has been turned, which is a piece of geometry not worth
   * writing twice.
   *
   * See docs/design/08-surfaces.md.
   */
  let {
    /** The document being drawn. */
    poster,
    /** Which layer is selected, if any. */
    selectedId = null,
    /** The pictures and link squares the editor has loaded, by layer. */
    assets = { images: {}, codes: {} },
    /** Somebody picked a layer, or picked nothing by pressing the ground. */
    onselect = () => {},
    /** A drag changed the document. The reason folds a drag into one undo step. */
    onchange = () => {},
    /** How tall each block of text came out, which only the drawing knows. */
    onmeasure = () => {},
  } = $props();

  /** How far one press of an arrow key moves a layer, and how far with Shift held. */
  const NUDGE = 1;
  const NUDGE_FAR = 10;

  /** The handles, as the eight compass points a person drags. */
  const HANDLES = [
    { key: 'northwest', label: 'the top left corner' },
    { key: 'north', label: 'the top edge' },
    { key: 'northeast', label: 'the top right corner' },
    { key: 'west', label: 'the left edge' },
    { key: 'east', label: 'the right edge' },
    { key: 'southwest', label: 'the bottom left corner' },
    { key: 'south', label: 'the bottom edge' },
    { key: 'southeast', label: 'the bottom right corner' },
  ];

  let canvas = $state(null);
  let stage = $state(null);
  let heights = $state({});
  /** What is being dragged, and the document it was picked up from. */
  let dragging = null;

  const selected = $derived(poster.layers.find(layer => layer.id === selectedId) ?? null);

  /** How tall a layer is on the poster, which for words is the words themselves. */
  function tallness(layer) {
    return layer.kind === 'text' ? (heights[layer.id] ?? layer.height) : layer.height;
  }

  /**
   * Where a layer sits on the screen, as the style of the box over it.
   *
   * It is written as a share of the sheet rather than in pixels, so that the
   * boxes follow the canvas at whatever width the page gives it without
   * anything having to measure the canvas as the window changes.
   */
  function boxOf(layer) {
    const across = value => `${(value / poster.width) * 100}%`;
    const down = value => `${(value / poster.height) * 100}%`;
    return [
      `left: ${across(layer.x)}`,
      `top: ${down(layer.y)}`,
      `width: ${across(layer.width)}`,
      `height: ${down(tallness(layer))}`,
      `transform: rotate(${layer.rotation ?? 0}deg)`,
    ].join(';');
  }

  /**
   * Draw the poster whenever anything it is made of changes, and report back
   * how tall each block of text came out. The boxes over the canvas read that
   * height, because the words decide it and only the drawing knows the words.
   */
  $effect(() => {
    const context = canvas?.getContext?.('2d');
    if (!context) return;

    canvas.width = poster.width;
    canvas.height = poster.height;
    drawPoster(context, poster, assets);

    const measured = textHeights(context, poster);
    const same = Object.keys(measured).length === Object.keys(heights).length
      && Object.entries(measured).every(([id, height]) => heights[id] === height);
    if (!same) {
      heights = measured;
      onmeasure(measured);
    }
  });

  /**
   * Turn a pointer event into the distance dragged, in the poster's own units.
   * How wide the sheet is drawn is read once, when the drag begins, because it
   * cannot change while a finger is down on it.
   */
  function distance(event) {
    const { scale } = dragging;
    if (!scale) return { dx: 0, dy: 0 };
    return {
      dx: (event.clientX - dragging.fromX) / scale,
      dy: (event.clientY - dragging.fromY) / scale,
    };
  }

  function beginDrag(event, layer, handle) {
    if (event.button !== undefined && event.button !== 0) return;
    onselect(layer.id);
    const drawnWidth = stage?.getBoundingClientRect?.().width ?? 0;
    dragging = {
      id: layer.id,
      handle,
      scale: drawnWidth > 0 ? drawnWidth / poster.width : 0,
      fromX: event.clientX,
      fromY: event.clientY,
      // Every move is measured against the document the drag began on, so a
      // long drag cannot accumulate the rounding of a hundred small ones.
      startedFrom: poster,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!dragging) return;
    const { dx, dy } = distance(event);
    const { id, handle, startedFrom } = dragging;
    onchange(
      handle
        ? resizeLayer(startedFrom, id, handle, dx, dy)
        : moveLayer(startedFrom, id, dx, dy),
      `${handle ? 'size' : 'move'}:${id}`,
    );
  }

  function endDrag() {
    dragging = null;
  }

  /**
   * The arrow keys move whatever is focused, which is how a layer is put
   * somewhere exact and the only way to move one without a pointer. Shift
   * moves it ten at a time, which is the step somebody uses to cross a poster.
   */
  function onKeyDown(event, layer) {
    const by = event.shiftKey ? NUDGE_FAR : NUDGE;
    const moves = {
      ArrowLeft: [-by, 0],
      ArrowRight: [by, 0],
      ArrowUp: [0, -by],
      ArrowDown: [0, by],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onselect(layer.id);
    onchange(moveLayer(poster, layer.id, move[0], move[1]), `move:${layer.id}`);
  }
</script>

<svelte:window on:pointermove={onPointerMove} on:pointerup={endDrag} on:pointercancel={endDrag} />

<div class="stage" bind:this={stage}>
  <canvas bind:this={canvas} class="sheet" aria-label="The poster as it will download"></canvas>

  <!--
    The ground. Pressing the poster where no layer is deselects, which is what
    every editor does and what a person reaches for to see the poster clean.
  -->
  <button
    type="button"
    class="ground"
    aria-label="Nothing on the poster, which clears the selection"
    onpointerdown={() => onselect(null)}
  ></button>

  {#each poster.layers as layer (layer.id)}
    {#if !layer.hidden}
      <button
        type="button"
        class="hit"
        class:picked={layer.id === selectedId}
        class:empty={layer.kind === 'image' && !layer.src}
        style={boxOf(layer)}
        aria-label={layer.name}
        aria-pressed={layer.id === selectedId}
        onpointerdown={event => beginDrag(event, layer, null)}
        onkeydown={event => onKeyDown(event, layer)}
      >
        <!--
          A picture box with nothing in it yet draws nothing on the canvas, so
          it would be an invisible hole a board could not find. It is outlined
          here, over the canvas rather than on it, so the outline is never part
          of what downloads.
        -->
        {#if layer.kind === 'image' && !layer.src}<span class="waiting">Choose a picture</span>{/if}
      </button>
    {/if}
  {/each}

  {#if selected && !selected.hidden}
    <div class="handles" style={boxOf(selected)} aria-hidden="true">
      {#each HANDLES as handle}
        {#if selected.kind !== 'text' || handle.key === 'east' || handle.key === 'west'}
          <span
            class="grip {handle.key}"
            title="Drag {handle.label}"
            onpointerdown={event => beginDrag(event, selected, handle.key)}
          ></span>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .stage {
    position: relative;
    width: 100%;
    max-width: 640px;
    line-height: 0;
    /*
     * The sheet casts the same shadow a card does, because a poster on this
     * screen is a sheet of paper lying on the page.
     */
    box-shadow: var(--shadow-float);
  }

  .sheet {
    width: 100%;
    height: auto;
    display: block;
  }

  /* The ground sits under every layer and catches whatever they do not. */
  .ground {
    position: absolute;
    inset: 0;
    background: none;
    border: 0;
    padding: 0;
    cursor: default;
  }

  .hit {
    position: absolute;
    background: none;
    border: 0;
    padding: 0;
    cursor: move;
    /* The box is a handle rather than a picture, so nothing is drawn in it. */
    outline-offset: 0;
  }

  /* An empty picture box, which is the one layer with nothing on the canvas. */
  .hit.empty {
    display: grid;
    place-items: center;
    box-shadow: inset 0 0 0 1.5px var(--line-strong);
    background: color-mix(in srgb, var(--paper) 55%, transparent);
  }

  .waiting {
    font-family: var(--display);
    font-stretch: 85%;
    font-weight: 700;
    font-size: 13px;
    line-height: 1.2;
    color: var(--muted);
  }

  .hit:hover {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 55%, transparent);
  }

  .hit.picked,
  .hit:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--primary);
  }

  /* The handles are drawn over the selected layer and turn with it. */
  .handles {
    position: absolute;
    pointer-events: none;
  }

  .grip {
    position: absolute;
    width: 11px;
    height: 11px;
    margin: -6px 0 0 -6px;
    background: var(--paper);
    box-shadow: inset 0 0 0 1.5px var(--primary);
    pointer-events: auto;
    touch-action: none;
  }

  .grip.northwest { left: 0; top: 0; cursor: nwse-resize; }
  .grip.north { left: 50%; top: 0; cursor: ns-resize; }
  .grip.northeast { left: 100%; top: 0; cursor: nesw-resize; }
  .grip.west { left: 0; top: 50%; cursor: ew-resize; }
  .grip.east { left: 100%; top: 50%; cursor: ew-resize; }
  .grip.southwest { left: 0; top: 100%; cursor: nesw-resize; }
  .grip.south { left: 50%; top: 100%; cursor: ns-resize; }
  .grip.southeast { left: 100%; top: 100%; cursor: nwse-resize; }
</style>
