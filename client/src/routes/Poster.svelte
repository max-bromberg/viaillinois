<script>
  import { onMount } from 'svelte';
  import QRCode from 'qrcode';
  import { navigate } from '../lib/router.js';
  import { getEvent } from '../api/events.js';
  import { getRso } from '../api/rsos.js';
  import { showToast } from '../stores/ui.js';
  import { organizationColor } from '../lib/organizationColor.js';
  import { resolvedTheme } from '../stores/theme.js';
  import { DEFAULT_ACCENT, isDark } from '../lib/posterPalette.js';
  import { Button } from '../lib/components/ui/index.js';
  import PosterCanvas from '../lib/poster/PosterCanvas.svelte';
  import { drawPoster } from '../lib/poster/draw.js';
  import PosterInspector from '../lib/poster/PosterInspector.svelte';
  import {
    addLayer, duplicateLayer, makeLayer, raiseLayer, removeLayer, updateLayer,
  } from '../lib/poster/document.js';
  import { TEMPLATES, posterFrom } from '../lib/poster/templates.js';
  import { ensureFont, fontFor } from '../lib/poster/fonts.js';
  import { canRedo, canUndo, newHistory, record, redo, undo } from '../lib/poster/history.js';
  import { forgetDesign, readDesign, writeDesign } from '../lib/poster/storage.js';

  /**
   * The poster designer.
   *
   * It used to draw one fixed layout with a handful of switches over it. A
   * board could change the colour of a poster and which of four pieces it
   * carried, and nothing else: not where the title sat, not how large it was,
   * not whether the room went above the hours, not whether there was a second
   * picture. A board that wanted any of that went and made the poster
   * somewhere else, and VIA lost the link square that is the one thing a
   * poster made here does better than a poster made anywhere else.
   *
   * What this is now is an editor. A design starts from a template, which is
   * the event already laid out in a shape somebody chose, and from there
   * everything on the sheet is a layer: pick it, drag it, size it, set it in
   * another face, recolour it, turn it, send it behind something else, copy
   * it, take it off. Add as many blocks of words, pictures and shapes as the
   * poster needs.
   *
   * The pieces of it are separate on purpose. The document and everything done
   * to it are pure functions in lib/poster, so undo is a stack of documents,
   * and the same drawing puts the poster on the screen and into the file that
   * downloads, so the preview cannot lie about what a board is about to get.
   */

  const urlParams = new URLSearchParams(window.location.search);
  const eventId = parseInt(urlParams.get('event'));
  const rsoId = parseInt(urlParams.get('rso'));

  let event = $state(null);
  let rso = $state(null);
  let loading = $state(true);
  let generating = $state(false);

  /**
   * Whether the board has already been told this design is not being kept, so
   * that they are told when it starts being true and not on every edit after.
   */
  let warnedNotKept = false;

  /** The accent a template draws in, which is the organization's own colour. */
  let accent = $state(DEFAULT_ACCENT);

  /** The design, and everywhere it has been, so that undo has somewhere to go. */
  let history = $state(newHistory(null));
  let selectedId = $state(null);

  /**
   * The pictures and the link squares, loaded once each and handed to the
   * drawing already drawn. The nonce is bumped whenever something arrives, so
   * that the drawing runs again for a picture or a face that was not there a
   * moment ago.
   */
  let assets = $state({ images: {}, codes: {}, nonce: 0 });

  const poster = $derived(history.present);
  const selected = $derived(poster?.layers.find(layer => layer.id === selectedId) ?? null);
  const eventUrl = $derived(`${window.location.origin}/events/${eventId}`);

  /** Take a new document, remembering where the old one was. */
  function change(next, reason = null) {
    history = record(history, next, reason);
  }

  /** Change some properties of the layer that is selected. */
  function changeSelected(properties, reason = null) {
    if (!selected) return;
    change(updateLayer(poster, selected.id, properties), reason);
  }

  /** Lay the event out again from a template, throwing away what was there. */
  function startFrom(key) {
    forgetDesign(eventId);
    history = newHistory(posterFrom(key, { event, rso, accent, eventUrl }));
    selectedId = null;
  }

  /** Put something new on the poster, selected, because that is what was wanted. */
  function add(kind, properties = {}) {
    const layer = makeLayer(kind, {
      x: 120,
      y: 360,
      ...(kind === 'qr' ? { href: eventUrl } : {}),
      ...properties,
    });
    change(addLayer(poster, layer));
    selectedId = layer.id;
  }

  // ── What the drawing needs loaded ───────────────────────────────────────

  /** Load a picture for every image layer that has one and has not been loaded. */
  async function loadPictures(document_) {
    for (const layer of document_.layers) {
      if (layer.kind !== 'image' || !layer.src || assets.images[layer.id]?.src === layer.src) {
        continue;
      }
      const picture = new Image();
      picture.src = layer.src;
      await picture.decode?.().catch(() => {});
      assets = { ...assets, images: { ...assets.images, [layer.id]: picture }, nonce: assets.nonce + 1 };
    }
  }

  /**
   * The VIA mark, sitting in the middle of a link square.
   *
   * A square carries enough correction that a mark over its middle still
   * scans, and the mark is what says the poster came from VIA. It is drawn on
   * a pad of the square's own ground so that it is never read as part of the
   * pattern, and inverted on a dark square so that it is visible at all.
   */
  async function markOn(square, layer) {
    const context = square.getContext?.('2d');
    if (!context) return;
    const size = square.width;
    const wide = Math.round(size * 0.26);
    const tall = Math.round(wide / (1060 / 476));
    const pad = Math.max(3, Math.round(size * 0.03));
    const left = Math.round((size - wide) / 2);
    const top = Math.round((size - tall) / 2);

    const mark = new Image();
    mark.src = '/via_logo_black.svg';
    await new Promise(settle => { mark.onload = settle; mark.onerror = settle; });
    if (!mark.naturalWidth) return;

    context.fillStyle = layer.background;
    context.fillRect(left - pad, top - pad, wide + pad * 2, tall + pad * 2);
    if (isDark(layer.background)) {
      context.save();
      context.filter = 'invert(1)';
      context.drawImage(mark, left, top, wide, tall);
      context.restore();
    } else {
      context.drawImage(mark, left, top, wide, tall);
    }
  }

  /** Draw a link square for every square layer whose colours or address changed. */
  async function loadSquares(document_) {
    for (const layer of document_.layers) {
      if (layer.kind !== 'qr' || !layer.href) continue;
      const asked = `${layer.href}|${layer.color}|${layer.background}`;
      if (assets.codes[layer.id]?.asked === asked) continue;

      try {
        const square = window.document.createElement('canvas');
        await QRCode.toCanvas(square, layer.href, {
          width: 480, margin: 1, errorCorrectionLevel: 'H',
          color: { dark: layer.color, light: layer.background },
        });
        await markOn(square, layer);
        square.asked = asked;
        assets = { ...assets, codes: { ...assets.codes, [layer.id]: square }, nonce: assets.nonce + 1 };
      } catch {
        // A square that could not be drawn leaves a gap rather than stopping
        // the rest of the poster from being drawn.
      }
    }
  }

  /**
   * Put every face the poster uses in front of the browser and wait for it. A
   * canvas draws with whatever is loaded at the moment it draws, so a poster
   * drawn before its face arrived is set in the fallback, which is not what the
   * board chose and not what would have downloaded.
   */
  async function loadFaces(document_) {
    const keys = new Set(document_.layers.filter(one => one.kind === 'text').map(one => one.fontKey));
    const faces = [...keys].map(key => fontFor(key)).filter(face => face?.google);
    if (faces.length === 0) return;
    await Promise.all(faces.map(face => ensureFont(face)));
    assets = { ...assets, nonce: assets.nonce + 1 };
  }

  $effect(() => {
    if (!poster) return;
    const drawn = poster;
    loadPictures(drawn);
    loadSquares(drawn);
    loadFaces(drawn);
  });

  /**
   * Keep the design in this browser, against this event, as it is edited.
   *
   * The browser refuses a design larger than the few megabytes it gives a site,
   * and it refuses it quietly. Left at that, a board member goes on working on
   * something that stopped being saved several edits ago and finds out by
   * reloading the page, which is the one moment the work cannot be got back. So
   * a refusal is said out loud, and said once: the effect runs on every
   * keystroke, and a warning on each of them would be its own kind of unusable.
   */
  $effect(() => {
    if (!poster || loading) return;
    const kept = writeDesign(eventId, poster);
    if (kept) {
      warnedNotKept = false;
    } else if (!warnedNotKept) {
      warnedNotKept = true;
      showToast(
        'This design is too large to keep in this browser, so it will not be here when you '
        + 'come back. Download the poster before you close this page.',
        'error',
      );
    }
  });

  // ── Data ────────────────────────────────────────────────────────────────

  onMount(async () => {
    if (isNaN(eventId) || isNaN(rsoId)) { navigate('/dashboard'); return; }
    try {
      const [{ event: loaded }, { rso: owner }] = await Promise.all([getEvent(eventId), getRso(rsoId)]);
      event = loaded;
      rso = owner;
      /**
       * An organization's colour is never shown as it was given, here least of
       * all: a poster is pinned up beside other posters, so a neon the feed
       * would have calmed down would shout across a corridor.
       */
      accent = organizationColor(owner?.logo_color, 'mark', $resolvedTheme);

      const kept = readDesign(eventId);
      history = newHistory(kept ?? posterFrom(TEMPLATES[0].key, {
        event: loaded, rso: owner, accent, eventUrl,
      }));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  });

  // ── A picture off the board member's own machine ────────────────────────

  /**
   * How large a picture may be before the designer turns it down.
   *
   * A picture is kept inside the design, written as text, which is about a
   * third larger again than the file it came from, and the whole design has to
   * sit in the few megabytes a browser gives a site. Two megabytes leaves room
   * for a second picture and for everything else on the sheet. A photograph
   * straight off a phone is larger than this, which is exactly the case worth
   * catching: it is turned down here, with the reason and what to do about it,
   * rather than silently ending the saving of the design.
   */
  const MAX_PICTURE_BYTES = 2 * 1024 * 1024;

  function choosePicture(file) {
    if (!file || !selected) return;

    if (file.size > MAX_PICTURE_BYTES) {
      showToast(
        `That picture is too large to keep in this browser. Please choose one under ${
          Math.round(MAX_PICTURE_BYTES / (1024 * 1024))} MB, or scale it down first.`,
        'error',
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => changeSelected({ src: String(reader.result) });
    reader.onerror = () => showToast('That picture could not be read.', 'error');
    reader.readAsDataURL(file);
  }

  // ── Download ────────────────────────────────────────────────────────────

  async function downloadPoster() {
    if (!poster || generating) return;
    generating = true;
    try {
      const sheet = window.document.createElement('canvas');
      sheet.width = poster.width;
      sheet.height = poster.height;
      const context = sheet.getContext('2d');
      if (!context) throw new Error('This browser will not draw a poster.');
      drawPoster(context, poster, assets);

      const link = window.document.createElement('a');
      link.download = `${(event?.title ?? 'event').replace(/[^a-z0-9]/gi, '-').toLowerCase()}-poster.png`;
      link.href = sheet.toDataURL('image/png');
      link.click();
    } catch {
      showToast('Could not draw the poster', 'error');
    } finally {
      generating = false;
    }
  }
</script>

<svelte:head>
  <title>{event ? `A poster for ${event.title}` : 'The poster designer'}: VIA</title>
</svelte:head>

<div class="designer">
  <div class="head">
    <Button variant="quiet" size="sm" icon="back" onclick={() => navigate('/dashboard')}>
      Back to the logistics dashboard
    </Button>
    <h1 class="title">The poster designer</h1>
    <p class="about">
      Everything on the sheet is yours to move. Press a piece of the poster to
      pick it up, drag it where you want it, and change what it says and how it
      is set in the panel beside it. The poster is drawn as you change it, and
      what you see here is what downloads.
    </p>
  </div>

  {#if loading}
    <div class="bone" aria-hidden="true"></div>
  {:else if !poster}
    <p class="help">That event is not on VIA, so there is nothing to make a poster of.</p>
  {:else}
    <div class="both">
      <!-- ── The poster, and what can be put on it ────────────────────────── -->
      <div class="showing">
        <div class="tools">
          <div class="adding">
            <Button variant="secondary" size="sm" onclick={() => add('text')}>Add words</Button>
            <Button variant="secondary" size="sm" onclick={() => add('image')}>Add a picture</Button>
            <Button variant="secondary" size="sm" onclick={() => add('shape')}>Add a shape</Button>
            <Button variant="secondary" size="sm" onclick={() => add('qr')}>Add a link square</Button>
          </div>
          <div class="stepping">
            <Button
              variant="quiet" size="sm" disabled={!canUndo(history)}
              onclick={() => { history = undo(history); }}
            >Undo</Button>
            <Button
              variant="quiet" size="sm" disabled={!canRedo(history)}
              onclick={() => { history = redo(history); }}
            >Redo</Button>
          </div>
        </div>

        <PosterCanvas
          {poster}
          {selectedId}
          {assets}
          onselect={id => { selectedId = id; }}
          onchange={(next, reason) => change(next, reason)}
        />

        <div class="under">
          <Button
            variant="primary" icon="arrow"
            disabled={generating}
            busy={generating}
            onclick={downloadPoster}
          >
            {generating ? 'Drawing the poster' : 'Download the poster'}
          </Button>
          <p class="help">
            800 by 1050 pixels, which prints and posts well. Your design is kept
            in this browser, on this machine, so you can come back to it. Nobody
            else on the board sees it, and it does not follow you to another
            computer.
          </p>
        </div>
      </div>

      <!-- ── The layers, and what the selected one is made of ─────────────── -->
      <div class="asking">
        <fieldset class="group">
          <legend>Start again from</legend>
          <div class="templates">
            {#each TEMPLATES as template}
              <button type="button" class="template" onclick={() => startFrom(template.key)}>
                <b>{template.name}</b>
                <span>{template.about}</span>
              </button>
            {/each}
          </div>
        </fieldset>

        <fieldset class="group">
          <legend>What is on the poster</legend>
          <ul class="layers">
            {#each [...poster.layers].reverse() as layer (layer.id)}
              <li>
                <button
                  type="button"
                  class="layer"
                  class:picked={layer.id === selectedId}
                  aria-pressed={layer.id === selectedId}
                  onclick={() => { selectedId = layer.id; }}
                >
                  <span class="what">{layer.name}</span>
                  {#if layer.hidden}<span class="off">off the poster</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        </fieldset>

        <PosterInspector
          layer={selected}
          background={poster.background}
          onchange={properties => changeSelected(properties)}
          onbackground={colour => change({ ...poster, background: colour }, 'ground')}
          onraise={steps => change(raiseLayer(poster, selected.id, steps))}
          onremove={() => { change(removeLayer(poster, selected.id)); selectedId = null; }}
          onduplicate={() => change(duplicateLayer(poster, selected.id))}
          onpicture={choosePicture}
        />
      </div>
    </div>
  {/if}
</div>

<style>
  .designer {
    display: grid;
    gap: 24px;
    align-content: start;
  }

  .head {
    display: grid;
    gap: 8px;
    justify-items: start;
  }

  /* A board tool carries its title at forty pixels, not fifty six. */
  .title {
    font-family: var(--display);
    font-stretch: 75%;
    font-variation-settings: "opsz" 96;
    font-weight: 800;
    font-size: 40px;
    line-height: 1.05;
    letter-spacing: .006em;
    margin: 0;
  }

  .about {
    margin: 0;
    color: var(--muted);
    font-size: 14.5px;
    max-width: 62ch;
  }

  /*
   * The poster comes first and the controls stand beside it, because the
   * poster is the thing being made and the controls are what is being done to
   * it. On a phone the controls fall under the poster.
   */
  .both {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 330px;
    gap: 40px;
    align-items: start;
  }

  .showing {
    display: grid;
    gap: 16px;
    justify-items: start;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 20px;
    align-items: center;
  }

  .adding,
  .stepping {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
  }

  .under {
    display: grid;
    gap: 10px;
    justify-items: start;
    max-width: 640px;
  }

  .asking {
    display: grid;
    gap: 26px;
    align-content: start;
  }

  .group {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
    align-content: start;
  }

  /* The name of a group is a label on it, in the display face at label size. */
  .group legend {
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 700;
    font-size: 14px;
    padding: 0;
  }

  .templates {
    display: grid;
    gap: 2px;
  }

  .template {
    font: inherit;
    text-align: left;
    background: none;
    border: 0;
    padding: 8px 10px;
    cursor: pointer;
    display: grid;
    gap: 2px;
    color: var(--ink);
  }

  .template:hover {
    background: var(--well);
  }

  .template:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  .template b {
    font-family: var(--display);
    font-stretch: 85%;
    font-weight: 700;
    font-size: 14.5px;
  }

  .template span {
    font-size: 13px;
    color: var(--muted);
  }

  .layers {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1px;
    max-height: 260px;
    overflow: auto;
  }

  .layer {
    font: inherit;
    font-size: 14px;
    width: 100%;
    text-align: left;
    background: none;
    border: 0;
    padding: 7px 10px;
    cursor: pointer;
    color: var(--ink);
    display: flex;
    gap: 10px;
    align-items: baseline;
  }

  .layer:hover {
    background: var(--well);
  }

  .layer.picked {
    background: var(--primary-soft);
    color: var(--primary-soft-fg);
  }

  .layer:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  .what {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .off {
    font-size: 12px;
    color: var(--muted);
  }

  .help {
    margin: 0;
    color: var(--muted);
    font-size: 13.5px;
    max-width: 62ch;
  }

  /* What stands where the poster will be until the event has arrived. */
  .bone {
    width: 100%;
    max-width: 640px;
    aspect-ratio: 800 / 1050;
    background: var(--well);
  }

  @media (max-width: 900px) {
    .both {
      grid-template-columns: minmax(0, 1fr);
      gap: 28px;
    }
  }
</style>
