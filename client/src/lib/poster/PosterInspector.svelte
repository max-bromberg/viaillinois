<script>
  import { Button, Field, Pad, Switch } from '../components/ui/index.js';
  import { FONT_GROUPS, fontFor } from './fonts.js';

  /**
   * What the selected layer is, in controls.
   *
   * Every property a layer carries is here, for whichever kind of layer is
   * selected, so that nothing about a poster is fixed in the way the four
   * switches the designer used to offer fixed almost all of it. A board that
   * wants the title in Bebas at ninety pixels, turned four degrees, in the
   * colour of the organization, can have exactly that.
   *
   * Nothing here decides anything. Every control hands a change back to the
   * designer, which is where a change to the document is recorded so that undo
   * has one place to look.
   */
  let {
    /** The layer being looked at, or null where nothing is selected. */
    layer = null,
    /** The poster's own ground colour, which is shown when nothing is selected. */
    background = '#ffffff',
    /** Change some properties of the selected layer. */
    onchange = () => {},
    /** Change the poster's ground. */
    onbackground = () => {},
    /** Move the layer up or down the stack, take it off, or copy it. */
    onraise = () => {},
    onremove = () => {},
    onduplicate = () => {},
    /** Put a picture into an image layer. */
    onpicture = () => {},
  } = $props();

  /** How words sit inside the width of their own box. */
  const ALIGNMENTS = [
    { key: 'left', label: 'Left' },
    { key: 'center', label: 'Centred' },
    { key: 'right', label: 'Right' },
  ];

  /** The shapes a shape layer can be. */
  const SHAPES = [
    { key: 'rectangle', label: 'A rectangle' },
    { key: 'ellipse', label: 'An ellipse' },
    { key: 'line', label: 'A line' },
  ];

  /** How a picture sits in a box that is not its own shape. */
  const FITS = [
    { key: 'cover', label: 'Fill the box, cropping what does not fit' },
    { key: 'contain', label: 'Fit inside the box, whole' },
  ];

  const face = $derived(layer?.kind === 'text' ? fontFor(layer.fontKey) : null);

  /** Take a number out of an input, holding it inside what it may be. */
  function number(value, low, high, fallback) {
    const read = Number(value);
    if (!Number.isFinite(read)) return fallback;
    return Math.min(Math.max(read, low), high);
  }

  const set = properties => onchange(properties);
</script>

{#if !layer}
  <div class="group">
    <p class="none">
      Nothing is selected. Press a piece of the poster to change it, or add
      something from the row above the poster.
    </p>
    <div class="fld">
      <label for="poster-ground">The colour of the poster itself</label>
      <div class="in">
        <Pad />
        <input
          id="poster-ground" type="color" class="swatch" value={background}
          oninput={event => onbackground(event.currentTarget.value)}
        />
        <span class="mono hex">{background}</span>
      </div>
    </div>
  </div>
{:else}
  <div class="group">
    <div class="named">
      <Field
        label="What this is called" id="poster-layer-name" value={layer.name}
        oninput={event => set({ name: event.currentTarget.value })}
        help="Only you see this. It names the layer in the list and to a screen reader."
      />
    </div>

    <div class="stack">
      <Button variant="secondary" size="sm" onclick={() => onraise(1)}>Bring forward</Button>
      <Button variant="secondary" size="sm" onclick={() => onraise(-1)}>Send back</Button>
      <Button variant="secondary" size="sm" onclick={onduplicate}>Make a copy</Button>
      <Button variant="danger" size="sm" onclick={onremove}>Take it off</Button>
    </div>
  </div>

  {#if layer.kind === 'text'}
    <fieldset class="group">
      <legend>The words</legend>
      <div class="fld">
        <label for="poster-words">What it says</label>
        <div class="in">
          <Pad />
          <textarea
            id="poster-words" rows="3" value={layer.text}
            oninput={event => set({ text: event.currentTarget.value })}
          ></textarea>
        </div>
      </div>

      <div class="fld">
        <label for="poster-face">The face it is set in</label>
        <div class="in">
          <Pad />
          <select
            id="poster-face" value={layer.fontKey}
            style="font-family: {face.css}; background: var(--paper)"
            onchange={event => set({ fontKey: event.currentTarget.value })}
          >
            {#each FONT_GROUPS as group}
              <optgroup label={group.label}>
                {#each group.fonts as font}
                  <option value={font.key} style="font-family: {font.css}">{font.name}</option>
                {/each}
              </optgroup>
            {/each}
          </select>
        </div>
      </div>

      <div class="pair">
        <div class="fld">
          <label for="poster-size">Size</label>
          <div class="in">
            <Pad />
            <input
              id="poster-size" type="number" min="6" max="240" value={layer.fontSize}
              oninput={event => set({ fontSize: number(event.currentTarget.value, 6, 240, 32) })}
            />
          </div>
        </div>
        <div class="fld">
          <label for="poster-leading">Line spacing</label>
          <div class="in">
            <Pad />
            <input
              id="poster-leading" type="number" min="0.7" max="3" step="0.05" value={layer.lineHeight}
              oninput={event => set({ lineHeight: number(event.currentTarget.value, 0.7, 3, 1.2) })}
            />
          </div>
        </div>
      </div>

      <div class="pair">
        <div class="fld">
          <label for="poster-tracking">Letter spacing</label>
          <div class="in">
            <Pad />
            <input
              id="poster-tracking" type="number" min="-5" max="30" step="0.5" value={layer.letterSpacing}
              oninput={event => set({ letterSpacing: number(event.currentTarget.value, -5, 30, 0) })}
            />
          </div>
        </div>
        <div class="fld">
          <label for="poster-colour">Colour</label>
          <div class="in">
            <Pad />
            <input
              id="poster-colour" type="color" class="swatch" value={layer.color}
              oninput={event => set({ color: event.currentTarget.value })}
            />
            <span class="mono hex">{layer.color}</span>
          </div>
        </div>
      </div>

      <div class="settings">
        <div class="setting">
          <Switch
            label="Set bold" checked={layer.weight >= 600}
            onchange={on => set({ weight: on ? 700 : 400 })}
          />
          <span>Set bold</span>
        </div>
        <div class="setting">
          <Switch
            label="Set italic" checked={Boolean(layer.italic)}
            onchange={on => set({ italic: on })}
          />
          <span>Set italic</span>
        </div>
      </div>

      <div class="choices" role="group" aria-label="How the words sit in their box">
        {#each ALIGNMENTS as alignment}
          <button
            type="button" class="check" aria-pressed={layer.align === alignment.key}
            onclick={() => set({ align: alignment.key })}
          >
            <Pad hollow={layer.align !== alignment.key} />
            <span>{alignment.label}</span>
          </button>
        {/each}
      </div>
    </fieldset>
  {/if}

  {#if layer.kind === 'shape'}
    <fieldset class="group">
      <legend>The shape</legend>
      <div class="choices" role="group" aria-label="Which shape this is">
        {#each SHAPES as shape}
          <button
            type="button" class="check" aria-pressed={layer.shape === shape.key}
            onclick={() => set({ shape: shape.key })}
          >
            <Pad hollow={layer.shape !== shape.key} />
            <span>{shape.label}</span>
          </button>
        {/each}
      </div>

      {#if layer.shape !== 'line'}
        <div class="fld">
          <label for="poster-fill">Fill</label>
          <div class="in">
            <Pad />
            <input
              id="poster-fill" type="color" class="swatch" value={layer.fill ?? '#000000'}
              oninput={event => set({ fill: event.currentTarget.value })}
            />
            <span class="mono hex">{layer.fill ?? 'none'}</span>
          </div>
        </div>
      {/if}

      <div class="pair">
        <div class="fld">
          <label for="poster-stroke">Outline</label>
          <div class="in">
            <Pad />
            <input
              id="poster-stroke" type="color" class="swatch" value={layer.stroke ?? '#000000'}
              oninput={event => set({ stroke: event.currentTarget.value })}
            />
          </div>
        </div>
        <div class="fld">
          <label for="poster-stroke-width">How thick the outline is</label>
          <div class="in">
            <Pad />
            <input
              id="poster-stroke-width" type="number" min="0" max="40" value={layer.strokeWidth}
              oninput={event => set({ strokeWidth: number(event.currentTarget.value, 0, 40, 0) })}
            />
          </div>
        </div>
      </div>

      {#if layer.shape === 'rectangle'}
        <div class="fld">
          <label for="poster-radius">How rounded the corners are</label>
          <div class="in">
            <Pad />
            <input
              id="poster-radius" type="number" min="0" max="200" value={layer.radius}
              oninput={event => set({ radius: number(event.currentTarget.value, 0, 200, 0) })}
            />
          </div>
        </div>
      {/if}
    </fieldset>
  {/if}

  {#if layer.kind === 'image'}
    <fieldset class="group">
      <legend>The picture</legend>
      {#if layer.src}
        <img src={layer.src} alt="What this layer carries" class="shown" />
      {/if}
      <label class="upload">
        <span>{layer.src ? 'Use another picture' : 'Choose a picture'}</span>
        <input
          type="file" accept="image/*"
          onchange={event => onpicture(event.currentTarget.files?.[0] ?? null)}
        />
      </label>

      <div class="choices" role="group" aria-label="How the picture sits in its box">
        {#each FITS as fit}
          <button
            type="button" class="check" aria-pressed={layer.fit === fit.key}
            onclick={() => set({ fit: fit.key })}
          >
            <Pad hollow={layer.fit !== fit.key} />
            <span>{fit.label}</span>
          </button>
        {/each}
      </div>

      <div class="pair">
        <div class="fld">
          <label for="poster-opacity">How solid it is</label>
          <div class="in">
            <Pad />
            <input
              id="poster-opacity" type="number" min="0" max="1" step="0.05" value={layer.opacity}
              oninput={event => set({ opacity: number(event.currentTarget.value, 0, 1, 1) })}
            />
          </div>
        </div>
        <div class="fld">
          <label for="poster-image-radius">How rounded the corners are</label>
          <div class="in">
            <Pad />
            <input
              id="poster-image-radius" type="number" min="0" max="200" value={layer.radius}
              oninput={event => set({ radius: number(event.currentTarget.value, 0, 200, 0) })}
            />
          </div>
        </div>
      </div>
    </fieldset>
  {/if}

  {#if layer.kind === 'qr'}
    <fieldset class="group">
      <legend>The link square</legend>
      <p class="help">
        The square opens this event on VIA. A student scans it with the camera
        they already have, which is why a poster carries one at all.
      </p>
      <div class="pair">
        <div class="fld">
          <label for="poster-qr-ink">The squares</label>
          <div class="in">
            <Pad />
            <input
              id="poster-qr-ink" type="color" class="swatch" value={layer.color}
              oninput={event => set({ color: event.currentTarget.value })}
            />
          </div>
        </div>
        <div class="fld">
          <label for="poster-qr-ground">Behind them</label>
          <div class="in">
            <Pad />
            <input
              id="poster-qr-ground" type="color" class="swatch" value={layer.background}
              oninput={event => set({ background: event.currentTarget.value })}
            />
          </div>
        </div>
      </div>
      <p class="help">
        A camera reads a square that stands well clear of what is behind it. A
        dark square on a light ground is the pair that always works.
      </p>
    </fieldset>
  {/if}

  <fieldset class="group">
    <legend>Where it sits</legend>
    <div class="pair">
      <div class="fld">
        <label for="poster-x">From the left</label>
        <div class="in">
          <Pad />
          <input
            id="poster-x" type="number" value={Math.round(layer.x)}
            oninput={event => set({ x: number(event.currentTarget.value, -2000, 2000, layer.x) })}
          />
        </div>
      </div>
      <div class="fld">
        <label for="poster-y">From the top</label>
        <div class="in">
          <Pad />
          <input
            id="poster-y" type="number" value={Math.round(layer.y)}
            oninput={event => set({ y: number(event.currentTarget.value, -2000, 2000, layer.y) })}
          />
        </div>
      </div>
    </div>

    <div class="pair">
      <div class="fld">
        <label for="poster-width">How wide</label>
        <div class="in">
          <Pad />
          <input
            id="poster-width" type="number" min="16" value={Math.round(layer.width)}
            oninput={event => set({ width: number(event.currentTarget.value, 16, 2000, layer.width) })}
          />
        </div>
      </div>
      {#if layer.kind !== 'text'}
        <div class="fld">
          <label for="poster-height">How tall</label>
          <div class="in">
            <Pad />
            <input
              id="poster-height" type="number" min="16" value={Math.round(layer.height)}
              oninput={event => set({ height: number(event.currentTarget.value, 16, 2000, layer.height) })}
            />
          </div>
        </div>
      {/if}
    </div>

    <div class="fld">
      <label for="poster-rotation">Turned by, in degrees</label>
      <div class="in">
        <Pad />
        <input
          id="poster-rotation" type="number" min="-180" max="180" value={Math.round(layer.rotation ?? 0)}
          oninput={event => set({ rotation: number(event.currentTarget.value, -180, 180, 0) })}
        />
      </div>
    </div>

    <div class="settings">
      <div class="setting">
        <Switch
          label="Leave this off the poster" checked={Boolean(layer.hidden)}
          onchange={on => set({ hidden: on })}
        />
        <span>Leave this off the poster</span>
      </div>
    </div>
  </fieldset>
{/if}

<style>
  .group {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 14px;
    align-content: start;
    justify-items: stretch;
  }

  /* The name of a group is a label on it, in the display face at label size. */
  .group legend {
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 700;
    font-size: 14px;
    padding: 0;
  }

  .none,
  .help {
    margin: 0;
    color: var(--muted);
    font-size: 13.5px;
    max-width: 46ch;
  }

  .named {
    display: grid;
  }

  .stack {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  .settings {
    display: grid;
    gap: 10px;
  }

  .setting {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14.5px;
  }

  .choices {
    display: grid;
    gap: 6px;
  }

  .check {
    font: inherit;
    font-size: 14.5px;
    background: none;
    border: 0;
    padding: 0;
    gap: 10px;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    color: var(--ink);
    text-align: left;
  }

  .check:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  textarea {
    font: inherit;
    font-size: 15px;
    border: 0;
    background: transparent;
    color: var(--ink);
    outline: 0;
    width: 100%;
    resize: vertical;
  }

  select {
    font: inherit;
    font-size: 15px;
    border: 0;
    color: var(--ink);
    outline: 0;
    width: 100%;
  }

  input[type="number"] {
    font: inherit;
    font-size: 15px;
    border: 0;
    background: transparent;
    color: var(--ink);
    outline: 0;
    width: 100%;
  }

  .swatch {
    appearance: none;
    width: 34px;
    height: 24px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }

  .hex {
    font-size: 12px;
    color: var(--muted);
  }

  .shown {
    max-width: 100%;
    max-height: 140px;
    object-fit: contain;
    justify-self: start;
  }

  .upload {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-family: var(--display);
    font-stretch: 85%;
    font-weight: 700;
    font-size: 13.5px;
    padding: 8px 14px 8px 12px;
    cursor: pointer;
    justify-self: start;
    background: transparent;
    color: var(--ink);
    box-shadow: inset 0 0 0 1.5px var(--ink);
  }

  .upload input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
</style>
