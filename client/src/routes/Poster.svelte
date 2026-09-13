<script>
  import { locationLabel } from '../lib/locationLabel.js';
  import { campusDate, campusTime } from '../lib/campusTime.js';
  import { LIGHT, DARK, DEFAULT_ACCENT, paletteOn, isDark } from '../lib/posterPalette.js';
  import { organizationColor } from '../lib/organizationColor.js';
  import { resolvedTheme } from '../stores/theme.js';
  import { onMount } from 'svelte';
  import { navigate } from '../lib/router.js';
  import { getEvent } from '../api/events.js';
  import { getRso } from '../api/rsos.js';
  import { showToast } from '../stores/ui.js';
  import QRCode from 'qrcode';
  import { Button, Field, Pad, Switch } from '../lib/components/ui/index.js';

  /**
   * The four pieces of the poster a board can leave off, held as one list so
   * that each is drawn as a switch rather than as four hand written toggles.
   */
  const PIECES = [
    { key: 'description', label: 'Description' },
    { key: 'dateAndTime', label: 'Date and time' },
    { key: 'location',    label: 'Location' },
    { key: 'tags',        label: 'Tags' },
  ];

  /** Which theme is which, in the words a board would use. */
  const THEMES = [
    { key: 'clean',   label: 'Clean' },
    { key: 'dark',    label: 'Dark' },
    { key: 'branded', label: 'The organization colour' },
  ];

  /** Where an uploaded image sits on the poster. */
  const PLACES = [
    { key: 'body',   label: 'In the body' },
    { key: 'header', label: 'Across the header' },
  ];

  function setPiece(key, on) {
    if (key === 'description') showDesc = on;
    if (key === 'dateAndTime') showDateTime = on;
    if (key === 'location') showLocation = on;
    if (key === 'tags') showTags = on;
  }

  const pieceIsOn = (key, desc, when, where, tagged) =>
    key === 'description' ? desc
    : key === 'dateAndTime' ? when
    : key === 'location' ? where
    : tagged;

  const urlParams = new URLSearchParams(window.location.search);
  const eventId   = parseInt(urlParams.get('event'));
  const rsoId     = parseInt(urlParams.get('rso'));

  let event = null, rso = null, loading = true, generating = false;
  /**
   * A poster is downloaded as an image and pinned up, so it is the one surface
   * that cannot take its colours from the stylesheet. They come from
   * client/src/lib/posterPalette.js, which is held against the token file by a
   * test. This used to draw in an indigo and a set of slate greys that appear
   * nowhere else on VIA.
   */
  let rsoAccentDefault = DEFAULT_ACCENT;
  let previewCanvas;
  let renderTimer;

  // ── Design config ─────────────────────────────────────────────────────────
  let accentColor  = DEFAULT_ACCENT;
  let bgColor      = LIGHT.ground;
  let fontKey      = 'system-sans';
  let activeTheme  = 'clean';
  let showDesc     = true;
  let showDateTime = true;
  let showLocation = true;
  let showTags     = true;
  let callout      = '';
  let customNote   = '';
  let customImageSrc = null;
  let customImageObj = null;
  let imagePosition  = 'body'; // 'body' | 'header'

  // ── Font library ──────────────────────────────────────────────────────────
  const FONT_GROUPS = [
    { label: 'System', fonts: [
      { key: 'system-sans',  name: 'System Sans',  css: 'system-ui,-apple-system,sans-serif',      google: null },
      { key: 'system-serif', name: 'System Serif', css: 'Georgia,Cambria,serif',                   google: null },
      { key: 'system-mono',  name: 'System Mono',  css: "ui-monospace,'Courier New',monospace",    google: null },
    ]},
    { label: 'Sans-Serif', fonts: [
      { key: 'inter',      name: 'Inter',        css: '"Inter",sans-serif',        google: 'Inter' },
      { key: 'roboto',     name: 'Roboto',       css: '"Roboto",sans-serif',       google: 'Roboto' },
      { key: 'open-sans',  name: 'Open Sans',    css: '"Open Sans",sans-serif',    google: 'Open+Sans' },
      { key: 'lato',       name: 'Lato',         css: '"Lato",sans-serif',         google: 'Lato' },
      { key: 'poppins',    name: 'Poppins',      css: '"Poppins",sans-serif',      google: 'Poppins' },
      { key: 'nunito',     name: 'Nunito',       css: '"Nunito",sans-serif',       google: 'Nunito' },
      { key: 'raleway',    name: 'Raleway',      css: '"Raleway",sans-serif',      google: 'Raleway' },
      { key: 'montserrat', name: 'Montserrat',   css: '"Montserrat",sans-serif',   google: 'Montserrat' },
      { key: 'dm-sans',    name: 'DM Sans',      css: '"DM Sans",sans-serif',      google: 'DM+Sans' },
      { key: 'outfit',     name: 'Outfit',       css: '"Outfit",sans-serif',       google: 'Outfit' },
      { key: 'figtree',    name: 'Figtree',      css: '"Figtree",sans-serif',      google: 'Figtree' },
      { key: 'plus-jakarta', name: 'Plus Jakarta Sans', css: '"Plus Jakarta Sans",sans-serif', google: 'Plus+Jakarta+Sans' },
    ]},
    { label: 'Serif', fonts: [
      { key: 'playfair',   name: 'Playfair Display',   css: '"Playfair Display",serif',   google: 'Playfair+Display' },
      { key: 'merriweather', name: 'Merriweather',     css: '"Merriweather",serif',        google: 'Merriweather' },
      { key: 'lora',       name: 'Lora',               css: '"Lora",serif',                google: 'Lora' },
      { key: 'eb-garamond', name: 'EB Garamond',       css: '"EB Garamond",serif',         google: 'EB+Garamond' },
      { key: 'cormorant',  name: 'Cormorant Garamond', css: '"Cormorant Garamond",serif',  google: 'Cormorant+Garamond' },
      { key: 'spectral',   name: 'Spectral',           css: '"Spectral",serif',            google: 'Spectral' },
    ]},
    { label: 'Display', fonts: [
      { key: 'bebas',     name: 'Bebas Neue',    css: '"Bebas Neue",sans-serif',  google: 'Bebas+Neue' },
      { key: 'anton',     name: 'Anton',         css: '"Anton",sans-serif',       google: 'Anton' },
      { key: 'oswald',    name: 'Oswald',        css: '"Oswald",sans-serif',      google: 'Oswald' },
      { key: 'righteous', name: 'Righteous',     css: '"Righteous",sans-serif',   google: 'Righteous' },
      { key: 'abril',     name: 'Abril Fatface', css: '"Abril Fatface",serif',    google: 'Abril+Fatface' },
      { key: 'russo',     name: 'Russo One',     css: '"Russo One",sans-serif',   google: 'Russo+One' },
    ]},
    { label: 'Script', fonts: [
      { key: 'pacifico',    name: 'Pacifico',       css: '"Pacifico",cursive',        google: 'Pacifico' },
      { key: 'lobster',     name: 'Lobster',        css: '"Lobster",cursive',         google: 'Lobster' },
      { key: 'dancing',     name: 'Dancing Script', css: '"Dancing Script",cursive',  google: 'Dancing+Script' },
      { key: 'great-vibes', name: 'Great Vibes',    css: '"Great Vibes",cursive',     google: 'Great+Vibes' },
    ]},
    { label: 'Monospace', fonts: [
      { key: 'space-mono',    name: 'Space Mono',    css: '"Space Mono",monospace',    google: 'Space+Mono' },
      { key: 'ibm-plex-mono', name: 'IBM Plex Mono', css: '"IBM Plex Mono",monospace', google: 'IBM+Plex+Mono' },
      { key: 'courier-prime', name: 'Courier Prime', css: '"Courier Prime",monospace', google: 'Courier+Prime' },
    ]},
  ];

  $: allFonts     = FONT_GROUPS.flatMap(g => g.fonts);
  $: selectedFont = allFonts.find(f => f.key === fontKey) ?? allFonts[0];

  // ── Reactive color roles ──────────────────────────────────────────────────
  $: if (activeTheme === 'branded') bgColor = accentColor;
  function applyTheme(t) {
    activeTheme = t;
    if      (t === 'dark')    bgColor = DARK.ground;
    else if (t === 'branded') bgColor = accentColor;
    else                      bgColor = LIGHT.ground;
  }

  $: ground      = paletteOn(bgColor);
  $: onAccent    = paletteOn(accentColor);
  $: bodyText    = ground.ink;
  $: bodyMuted   = ground.muted;
  $: headerText  = onAccent.ink;
  $: qrDark      = ground.ink;
  $: dividerColor = ground.line;
  $: tags        = event?.tags ? event.tags.split(',').filter(Boolean) : [];
  $: eventUrl    = `${window.location.origin}/events/${eventId}`;
  $: accentRgb   = hexToRgb(accentColor);

  // Re-render whenever any config dependency changes
  $: configStamp = [accentColor, bgColor, fontKey, showDesc, showDateTime, showLocation,
                    showTags, callout, customNote, imagePosition, customImageSrc].join('|');
  $: if (previewCanvas && event && configStamp) scheduleRender();

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => renderToCanvas(previewCanvas), 90);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isColorDark = isDark;
  function hexToRgb(hex) {
    const c = String(hex ?? '').replace('#', '');
    if (c.length < 6) return hexToRgb(DEFAULT_ACCENT);
    return `${parseInt(c.substr(0,2),16)},${parseInt(c.substr(2,2),16)},${parseInt(c.substr(4,2),16)}`;
  }
  const fmtDate = d => campusDate(d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const fmtTime = d => campusTime(d);
  function wrapText(ctx, text, maxWidth) {
    const words = (text || '').split(' ');
    const lines = []; let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  // Draw image fitting within a box, maintaining aspect ratio; returns drawn height
  function drawImageFit(ctx, img, x, y, maxW, maxH) {
    const r = img.naturalWidth / img.naturalHeight;
    let dw = maxW, dh = maxW / r;
    if (dh > maxH) { dh = maxH; dw = maxH * r; }
    ctx.drawImage(img, x + (maxW - dw) / 2, y, dw, dh);
    return dh;
  }

  // ── Google Fonts loader ───────────────────────────────────────────────────
  const loadedFonts = new Set();
  async function ensureFont(font) {
    if (!font.google) return;
    if (!loadedFonts.has(font.key)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${font.google}:ital,wght@0,400;0,700;1,400&display=swap`;
      document.head.appendChild(link);
      loadedFonts.add(font.key);
    }
    try {
      await Promise.all([
        document.fonts.load(`bold 48px "${font.name}"`),
        document.fonts.load(`400 21px "${font.name}"`),
      ]);
    } catch {}
  }

  // ── QR + VIA logo overlay ─────────────────────────────────────────────────
  // Logo viewBox: 1060 × 476 → ratio ≈ 2.227 (wide landscape)
  const LOGO_RATIO = 1060 / 476;

  async function makeQrCanvas(url, size) {
    const qrEl = document.createElement('canvas');
    await QRCode.toCanvas(qrEl, url, {
      width: size, margin: 1, errorCorrectionLevel: 'H',
      color: { dark: qrDark, light: bgColor },
    });
    await overlayLogo(qrEl);
    return qrEl;
  }

  async function overlayLogo(qrCanvas) {
    const ctx = qrCanvas.getContext('2d');
    const sz  = qrCanvas.width;

    // Bounding area for logo: ~26% of QR width, centered
    const areaW = Math.round(sz * 0.26);
    const areaH = Math.round(areaW / LOGO_RATIO); // preserve 1060:476 ratio
    const pad   = Math.max(3, Math.round(sz * 0.03));

    const lx = Math.round((sz - areaW) / 2);
    const ly = Math.round((sz - areaH) / 2);

    const img = new Image();
    img.src = '/via_logo_black.svg';
    await new Promise(r => { img.onload = r; img.onerror = r; });
    if (!img.naturalWidth) return;

    // Background rect with padding
    ctx.fillStyle = bgColor;
    ctx.fillRect(lx - pad, ly - pad, areaW + pad * 2, areaH + pad * 2);

    if (isColorDark(bgColor)) {
      ctx.save();
      ctx.filter = 'invert(1)';
      ctx.drawImage(img, lx, ly, areaW, areaH);
      ctx.restore();
    } else {
      ctx.drawImage(img, lx, ly, areaW, areaH);
    }
  }

  // ── Main render ───────────────────────────────────────────────────────────
  async function renderToCanvas(canvas) {
    if (!event) return;
    const W = 800, H = 1050, M = 48;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const f   = selectedFont;

    await ensureFont(f);
    const fc = f.css;

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    // ── Header band ──────────────────────────────────────────────────────────
    const BAND_H = (customImageObj && imagePosition === 'header') ? 230 : 185;
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, 0, W, BAND_H);

    // Custom image in header (right side, fit within band)
    if (customImageObj && imagePosition === 'header') {
      const imgH = BAND_H - 24;
      const imgW = Math.min(imgH * (customImageObj.naturalWidth / customImageObj.naturalHeight), W - M * 2 - 220);
      const ix = W - M - imgW;
      ctx.save();
      ctx.beginPath();
      ctx.rect(ix, 12, imgW, imgH);
      ctx.clip();
      drawImageFit(ctx, customImageObj, ix, 12, imgW, imgH);
      ctx.restore();
    }

    // RSO name
    ctx.fillStyle = headerText;
    ctx.font = `bold 28px ${fc}`;
    ctx.fillText(rso?.name || event.rso_name || '', M, Math.round(BAND_H * 0.52));
    ctx.globalAlpha = 0.65;
    ctx.font = `18px ${fc}`;
    ctx.fillText('presents', M, Math.round(BAND_H * 0.73));
    ctx.globalAlpha = 1;

    // ── Body ─────────────────────────────────────────────────────────────────
    // Left accent stripe
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, BAND_H, 6, H - BAND_H);

    let y = BAND_H + 52;

    // Callout
    if (callout.trim()) {
      ctx.font = `bold 30px ${fc}`;
      ctx.fillStyle = accentColor;
      for (const line of wrapText(ctx, callout.trim(), W - M * 2).slice(0, 2)) {
        ctx.fillText(line, M, y); y += 40;
      }
      y += 10;
    }

    // Title
    ctx.fillStyle = bodyText;
    ctx.font = `bold 48px ${fc}`;
    for (const line of wrapText(ctx, event.title, W - M * 2).slice(0, 3)) {
      ctx.fillText(line, M, y); y += 60;
    }
    y += 18;

    // Custom image in body (below title)
    if (customImageObj && imagePosition === 'body') {
      const drawnH = drawImageFit(ctx, customImageObj, M, y, W - M * 2, 210);
      y += drawnH + 22;
    }

    // Date / time / location
    ctx.font = `21px ${fc}`;
    ctx.fillStyle = bodyMuted;
    if (showDateTime) {
      // The date, the hour and the room are set as words. They used to be
      // prefixed with emoji, which draw differently on every platform the
      // poster is opened on, and the poster is a file somebody else opens.
      ctx.fillText(fmtDate(event.start_time), M, y); y += 38;
      ctx.fillText(`${fmtTime(event.start_time)} to ${fmtTime(event.end_time)}`, M, y); y += 38;
    }
    if (showLocation) {
      ctx.fillText(locationLabel(event), M, y); y += 38;
    }

    // Description
    if (showDesc && event.description && y < 720) {
      y += 10;
      ctx.font = `17px ${fc}`;
      for (const line of wrapText(ctx, event.description, W - M * 2 - 20).slice(0, 3)) {
        if (y < 745) { ctx.fillText(line, M, y); y += 25; }
      }
    }

    // Tags
    if (showTags && tags.length && y < 810) {
      y = Math.max(y + 12, Math.min(y + 12, 795));
      ctx.font = `bold 14px ${fc}`;
      ctx.fillStyle = accentColor;
      ctx.fillText(tags.join(',   '), M, y);
    }

    // Custom note
    if (customNote.trim()) {
      ctx.font = `italic 15px ${fc}`;
      ctx.fillStyle = bodyMuted;
      ctx.fillText(customNote.trim().slice(0, 90), M, 828);
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    ctx.strokeStyle = dividerColor;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(M, 868); ctx.lineTo(W - M, 868); ctx.stroke();

    ctx.fillStyle = bodyMuted;
    ctx.font = `15px ${fc}`;
    ctx.fillText('Scan for details', M, 922);

    // QR + logo
    try {
      const qrEl = await makeQrCanvas(eventUrl, 160);
      ctx.drawImage(qrEl, W - M - 160, 854, 160, 160);
    } catch {}
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  onMount(async () => {
    if (isNaN(eventId) || isNaN(rsoId)) { navigate('/dashboard'); return; }
    try {
      const [{ event: e }, { rso: r }] = await Promise.all([getEvent(eventId), getRso(rsoId)]);
      event = e; rso = r;
      /**
       * An organization's colour is never shown as it was given, here least of
       * all: a poster is pinned up beside other posters, so a neon that the feed
       * would have calmed down would shout across a corridor.
       */
      rsoAccentDefault = organizationColor(r?.logo_color, 'mark', $resolvedTheme);
      accentColor = rsoAccentDefault;
    } catch (err) { showToast(err.message, 'error'); }
    finally { loading = false; }
  });

  // ── Image upload ──────────────────────────────────────────────────────────
  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      customImageSrc = ev.target.result;
      const img = new Image();
      img.onload = () => { customImageObj = img; scheduleRender(); };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }
  function clearImage() { customImageSrc = null; customImageObj = null; scheduleRender(); }

  // ── Download ──────────────────────────────────────────────────────────────
  async function downloadPoster() {
    if (!event || generating) return;
    generating = true;
    try {
      const cv = document.createElement('canvas');
      await renderToCanvas(cv);
      const a = document.createElement('a');
      a.download = `${(event.title||'event').replace(/[^a-z0-9]/gi,'-').toLowerCase()}-poster.png`;
      a.href = cv.toDataURL('image/png');
      a.click();
    } catch { showToast('Could not generate poster', 'error'); }
    finally { generating = false; }
  }

  function resetAll() {
    accentColor = rsoAccentDefault; bgColor = LIGHT.ground;
    fontKey = 'system-sans'; activeTheme = 'clean';
    showDesc = showDateTime = showLocation = showTags = true;
    callout = ''; customNote = '';
    customImageSrc = null; customImageObj = null; imagePosition = 'body';
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
      The poster is drawn as you change it, and what you see here is what downloads.
    </p>
  </div>

  <div class="both">

    <!-- ── What the poster is made of ─────────────────────────────────────── -->
    <div class="asking">
      <div class="resetting">
        <Button variant="quiet" size="sm" onclick={resetAll}>Put everything back as it was</Button>
      </div>

      <fieldset class="group">
        <legend>Theme</legend>
        <div class="choices">
          {#each THEMES as theme}
            <button
              type="button" class="check" aria-pressed={activeTheme === theme.key}
              on:click={() => applyTheme(theme.key)}
            >
              <Pad hollow={activeTheme !== theme.key} />
              <span>{theme.label}</span>
            </button>
          {/each}
        </div>
      </fieldset>

      <fieldset class="group">
        <legend>Colours</legend>
        <div class="fld">
          <label for="poster-accent">Accent</label>
          <div class="in">
            <Pad />
            <input id="poster-accent" type="color" class="swatch" bind:value={accentColor} />
            <span class="mono hex">{accentColor}</span>
            {#if accentColor !== rsoAccentDefault}
              <Button
                variant="quiet" size="sm"
                onclick={() => { accentColor = rsoAccentDefault; if (activeTheme === 'branded') bgColor = rsoAccentDefault; }}
              >Back to the organization colour</Button>
            {/if}
          </div>
        </div>
        <div class="fld">
          <label for="poster-bg">Background</label>
          <div class="in">
            <Pad />
            <input
              id="poster-bg" type="color" class="swatch" bind:value={bgColor}
              on:input={() => activeTheme = ''}
            />
            <span class="mono hex">{bgColor}</span>
          </div>
        </div>
      </fieldset>

      <fieldset class="group">
        <legend>Typeface</legend>
        <div class="fld">
          <label for="poster-font">The face the poster is set in</label>
          <div class="in">
            <Pad />
            <select
              id="poster-font" bind:value={fontKey}
              style="font-family: {selectedFont.css}; background: var(--paper)"
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
          <p class="help" style="font-family: {selectedFont.css}">
            The quick brown fox jumps over the lazy dog.
          </p>
        </div>
      </fieldset>

      <fieldset class="group">
        <legend>An image of your own</legend>
        {#if customImageSrc}
          <img src={customImageSrc} alt="What this poster carries" class="shown" />
          <Button variant="secondary" size="sm" onclick={clearImage}>Take the image off</Button>
          <div class="choices">
            {#each PLACES as place}
              <button
                type="button" class="check" aria-pressed={imagePosition === place.key}
                on:click={() => imagePosition = place.key}
              >
                <Pad hollow={imagePosition !== place.key} />
                <span>{place.label}</span>
              </button>
            {/each}
          </div>
        {:else}
          <label class="upload">
            <span>Add an image</span>
            <input type="file" accept="image/*" on:change={handleImageUpload} />
          </label>
        {/if}
      </fieldset>

      <fieldset class="group">
        <legend>What the poster carries</legend>
        <div class="settings">
          {#each PIECES as piece}
            {@const on = pieceIsOn(piece.key, showDesc, showDateTime, showLocation, showTags)}
            <div class="setting">
              <Switch label={piece.label} checked={on} onchange={next => setPiece(piece.key, next)} />
              <span>{piece.label}</span>
            </div>
          {/each}
        </div>
      </fieldset>

      <fieldset class="group">
        <legend>Words of your own</legend>
        <Field
          label="Callout" id="poster-callout" bind:value={callout} maxlength="60"
          placeholder="Free food from six"
          help="Set large on the poster, in the accent colour."
        />
        <Field
          label="A note at the foot" id="poster-note" bind:value={customNote} maxlength="90"
          placeholder="Open to every student"
          help="Set small, near the bottom of the poster."
        />
      </fieldset>
    </div>

    <!-- ── The poster itself ──────────────────────────────────────────────── -->
    <div class="showing">
      <div class="tools">
        <Button
          variant="primary" icon="arrow"
          disabled={!event || generating || loading}
          busy={generating}
          onclick={downloadPoster}
        >
          {generating ? 'Drawing the poster' : 'Download the poster'}
        </Button>
      </div>

      {#if loading}
        <div class="bone" aria-hidden="true"></div>
      {:else if event}
        <canvas
          bind:this={previewCanvas}
          class="poster-preview"
          style="border-color: {accentColor}"
          aria-label="The poster as it will download"
        ></canvas>
        <p class="help">800 by 1050 pixels, which prints and posts well.</p>
      {:else}
        <p class="help">That event is not on VIA, so there is nothing to make a poster of.</p>
      {/if}
    </div>
  </div>
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

  .both {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    gap: 40px;
    align-items: start;
  }

  .asking {
    display: grid;
    gap: 26px;
    align-content: start;
  }

  .resetting {
    justify-self: start;
  }

  .group {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
    align-content: start;
    justify-items: start;
  }

  /*
   * The name of a group is a label on the group, in the display face at the
   * size a field label takes. It used to be set in small uppercase above the
   * group, which is the eyebrow label the design does not use.
   */
  .group legend {
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 700;
    font-size: 14px;
    padding: 0;
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 20px;
  }

  .check {
    font: inherit;
    font-size: 14.5px;
    background: none;
    border: 0;
    padding: 0;
    gap: 10px;
    color: var(--ink);
    cursor: pointer;
  }

  .check[aria-pressed="false"] span {
    color: var(--muted);
  }

  .check:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  .fld {
    width: 100%;
  }

  .fld .in select {
    font: inherit;
    font-size: 16px;
    border: 0;
    color: var(--ink);
    outline: 0;
    width: 100%;
    padding: 2px 0;
  }

  .swatch {
    width: 44px;
    height: 28px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    flex: none;
  }

  .hex {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--muted);
  }

  .help {
    font-size: 12.5px;
    color: var(--muted);
    margin: 0;
    max-width: 52ch;
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

  /*
   * The upload target is the field's line rather than a dashed rectangle, and
   * the input itself is taken out of the flow but left reachable by keyboard.
   */
  .upload {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 32px;
    font-family: var(--display);
    font-stretch: 85%;
    font-weight: 700;
    font-size: 15px;
    color: var(--primary);
    border-bottom: 2px solid var(--line-strong);
    padding: 6px 0;
    cursor: pointer;
  }

  .upload:focus-within {
    border-bottom-color: var(--primary);
  }

  .upload input {
    width: 1px;
    height: 1px;
    opacity: 0;
    position: absolute;
  }

  .shown {
    width: 100%;
    max-height: 96px;
    object-fit: cover;
  }

  .showing {
    display: grid;
    gap: 16px;
    justify-items: start;
    min-width: 0;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    align-items: center;
  }

  /*
   * The poster floats above the page while it is being worked on, which is the
   * one thing on a board tool that carries a shadow.
   */
  .poster-preview {
    display: block;
    width: 100%;
    max-width: 520px;
    border: 2px solid var(--line-strong);
  }

  /* Loading draws the shape of the poster in the well colour, with no shimmer. */
  .bone {
    width: 100%;
    max-width: 520px;
    aspect-ratio: 800 / 1050;
    background: var(--well);
  }

  @media (max-width: 900px) {
    .both {
      grid-template-columns: 1fr;
    }
  }

  /*
   * A field written out here rather than taken from the Field component still
   * has to carry the state on its line, so the rule and the pad turn primary
   * when whatever sits between them has the focus.
   */
  .fld .in:focus-within {
    border-color: var(--primary);
    box-shadow: 0 2px 0 0 var(--primary);
  }

  .fld .in:focus-within :global(.pad) {
    --h: var(--primary);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 22%, transparent);
  }
</style>
