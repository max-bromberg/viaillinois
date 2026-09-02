<script>
  import { locationLabel } from '../lib/locationLabel.js';
  import { campusDate, campusTime } from '../lib/campusTime.js';
  import { onMount } from 'svelte';
  import { navigate } from '../lib/router.js';
  import { getEvent } from '../api/events.js';
  import { getRso } from '../api/rsos.js';
  import { showToast } from '../stores/ui.js';
  import QRCode from 'qrcode';

  const urlParams = new URLSearchParams(window.location.search);
  const eventId   = parseInt(urlParams.get('event'));
  const rsoId     = parseInt(urlParams.get('rso'));

  let event = null, rso = null, loading = true, generating = false;
  let rsoAccentDefault = '#6366f1';
  let previewCanvas;
  let renderTimer;

  // ── Design config ─────────────────────────────────────────────────────────
  let accentColor  = '#6366f1';
  let bgColor      = '#f9fafb';
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
    if      (t === 'dark')    bgColor = '#0f172a';
    else if (t === 'branded') bgColor = accentColor;
    else                      bgColor = '#f9fafb';
  }

  $: bodyText    = isColorDark(bgColor)     ? '#f1f5f9' : '#111827';
  $: bodyMuted   = isColorDark(bgColor)     ? '#94a3b8' : '#6b7280';
  $: headerText  = isColorDark(accentColor) ? '#ffffff' : '#111827';
  $: qrDark      = isColorDark(bgColor)     ? '#f1f5f9' : '#111827';
  $: dividerColor = isColorDark(bgColor)    ? '#1e293b' : '#e2e8f0';
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
  function isColorDark(hex) {
    const c = (hex || '#000').replace('#', '');
    if (c.length < 6) return true;
    const r = parseInt(c.substr(0,2),16), g = parseInt(c.substr(2,2),16), b = parseInt(c.substr(4,2),16);
    return (0.299*r + 0.587*g + 0.114*b) < 140;
  }
  function hexToRgb(hex) {
    const c = (hex||'#6366f1').replace('#','');
    if (c.length < 6) return '99,102,241';
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
      ctx.fillText(`📅  ${fmtDate(event.start_time)}`, M, y); y += 38;
      ctx.fillText(`🕐  ${fmtTime(event.start_time)} to ${fmtTime(event.end_time)}`, M, y); y += 38;
    }
    if (showLocation) {
      ctx.fillText(`📍  ${locationLabel(event)}`, M, y); y += 38;
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
      ctx.fillText(tags.join('  ·  '), M, y);
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
      rsoAccentDefault = r?.logo_color || '#6366f1';
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
    accentColor = rsoAccentDefault; bgColor = '#f9fafb';
    fontKey = 'system-sans'; activeTheme = 'clean';
    showDesc = showDateTime = showLocation = showTags = true;
    callout = ''; customNote = '';
    customImageSrc = null; customImageObj = null; imagePosition = 'body';
  }
</script>

<svelte:head>
  <title>{event ? `Poster for ${event.title}` : 'Event Poster'}: VIA</title>
</svelte:head>

<button
  class="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors mb-5"
  on:click={() => navigate('/dashboard')}
>
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
  Back to Dashboard
</button>

<div class="flex flex-col lg:flex-row gap-8 items-start">

  <!-- ── Controls ─────────────────────────────────────────────────────────── -->
  <div class="w-full lg:w-68 shrink-0 lg:sticky lg:top-20 space-y-5 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:pb-4" style="min-width:260px;max-width:280px">

    <div class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-bold">Poster Editor</h1>
      <button class="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2" on:click={resetAll}>Reset</button>
    </div>

    <!-- Theme -->
    <div class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Theme</p>
      <div class="flex gap-1.5">
        {#each [['clean','Clean'],['dark','Dark'],['branded','Branded']] as [k, lbl]}
          <button
            class="flex-1 text-xs py-1.5 rounded border transition-colors
              {activeTheme === k ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}"
            on:click={() => applyTheme(k)}
          >{lbl}</button>
        {/each}
      </div>
    </div>

    <!-- Colors -->
    <div class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Colors</p>
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm">Accent</span>
          <div class="flex items-center gap-2">
            {#if accentColor !== rsoAccentDefault}
              <button class="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                on:click={() => { accentColor = rsoAccentDefault; if (activeTheme === 'branded') bgColor = rsoAccentDefault; }}>
                Reset
              </button>
            {/if}
            <input type="color" bind:value={accentColor} class="h-7 w-12 rounded border cursor-pointer" />
          </div>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm">Background</span>
          <input type="color" bind:value={bgColor} class="h-7 w-12 rounded border cursor-pointer"
            on:input={() => activeTheme = ''} />
        </div>
      </div>
    </div>

    <!-- Font -->
    <div class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Font</p>
      <select
        bind:value={fontKey}
        class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
        style="font-family: {selectedFont.css}"
      >
        {#each FONT_GROUPS as group}
          <optgroup label={group.label}>
            {#each group.fonts as font}
              <option value={font.key} style="font-family: {font.css}">{font.name}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
      <p class="text-xs text-muted-foreground pl-0.5" style="font-family: {selectedFont.css}">
        The quick brown fox jumps over the lazy dog
      </p>
    </div>

    <!-- Custom image -->
    <div class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom Image</p>
      {#if customImageSrc}
        <div class="relative rounded overflow-hidden border">
          <img src={customImageSrc} alt="Custom" class="w-full h-20 object-cover" />
          <button
            class="absolute top-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded hover:bg-black/80"
            on:click={clearImage}
          >✕ Remove</button>
        </div>
        <div class="space-y-1">
          <p class="text-xs text-muted-foreground">Placement</p>
          <div class="flex gap-1.5">
            {#each [['body','Body'],['header','Header band']] as [k, lbl]}
              <button
                class="flex-1 text-xs py-1.5 rounded border transition-colors
                  {imagePosition === k ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}"
                on:click={() => imagePosition = k}
              >{lbl}</button>
            {/each}
          </div>
        </div>
      {:else}
        <label class="flex items-center justify-center gap-2 w-full border-2 border-dashed rounded-md py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary cursor-pointer transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          Upload image
          <input type="file" accept="image/*" class="hidden" on:change={handleImageUpload} />
        </label>
      {/if}
    </div>

    <!-- Content toggles -->
    <div class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Content</p>
      <div class="space-y-2">
        {#each [
          ['showDesc',     'Description'],
          ['showDateTime', 'Date & time'],
          ['showLocation', 'Location'],
          ['showTags',     'Tags'],
        ] as [key, label]}
          {@const checked = key === 'showDesc' ? showDesc : key === 'showDateTime' ? showDateTime : key === 'showLocation' ? showLocation : showTags}
          <label class="flex items-center justify-between cursor-pointer select-none">
            <span class="text-sm">{label}</span>
            <button
              role="switch"
              aria-checked={checked}
              class="relative inline-flex rounded-full transition-colors flex-shrink-0
                {checked ? 'bg-primary' : 'bg-muted'}"
              style="width:34px;height:18px;"
              on:click={() => {
                if (key === 'showDesc')     showDesc     = !showDesc;
                if (key === 'showDateTime') showDateTime = !showDateTime;
                if (key === 'showLocation') showLocation = !showLocation;
                if (key === 'showTags')     showTags     = !showTags;
              }}
            >
              <span
                class="absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform"
                style="left: 2px; transform: translateX({checked ? '16px' : '0'})"
              ></span>
            </button>
          </label>
        {/each}
      </div>
    </div>

    <!-- Custom text -->
    <div class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom Text</p>
      <div class="space-y-2">
        <div class="space-y-1">
          <label class="text-xs text-muted-foreground">Callout <span class="opacity-60">(big, accent color)</span></label>
          <input class="w-full border rounded px-2.5 py-1.5 text-sm bg-background"
            placeholder='e.g. "Free food! 🍕"' bind:value={callout} maxlength="60" />
        </div>
        <div class="space-y-1">
          <label class="text-xs text-muted-foreground">Extra note <span class="opacity-60">(small, near bottom)</span></label>
          <input class="w-full border rounded px-2.5 py-1.5 text-sm bg-background"
            placeholder="e.g. Open to all students" bind:value={customNote} maxlength="90" />
        </div>
      </div>
    </div>

  </div>

  <!-- ── Preview ───────────────────────────────────────────────────────────── -->
  <div class="flex-1 min-w-0 space-y-4">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <p class="text-sm text-muted-foreground">Live preview: what you see is what downloads</p>
      <button
        class="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md
               hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
        disabled={!event || generating || loading}
        on:click={downloadPoster}
      >
        {#if generating}
          <svg class="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Generating…
        {:else}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download PNG
        {/if}
      </button>
    </div>

    {#if loading}
      <div class="rounded-xl border-2 border-border animate-pulse bg-card" style="aspect-ratio: 800/1050; max-width: 520px;"></div>
    {:else if event}
      <canvas
        bind:this={previewCanvas}
        class="block rounded-xl shadow-xl border-2"
        style="width:100%; max-width:520px; border-color:{accentColor}; display:block;"
      ></canvas>
      <p class="text-xs text-muted-foreground">800 × 1050 px, suitable for print and social media.</p>
    {:else}
      <p class="text-sm text-muted-foreground">Event not found.</p>
    {/if}
  </div>

</div>
