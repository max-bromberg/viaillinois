<script>
  import { locationLabel } from '../lib/locationLabel.js';
  import { campusDate, campusTime } from '../lib/campusTime.js';
  import { onMount } from 'svelte';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import QRCode from 'qrcode';
  import { getEvent } from '../api/events.js';
  import { recurrenceLabel } from '../lib/recurrenceLabel.js';
  import { getRso } from '../api/rsos.js';
  import { navigate } from '../lib/router.js';
  import { showToast } from '../stores/ui.js';

  export let id;

  let event    = null;
  let rso      = null;
  let loading  = true;
  let error    = null;
  let showQr   = false;
  let qrDataUrl = '';

  $: canonicalUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/events/${id}`
    : `/events/${id}`;
  $: tags = event?.tags ? event.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
  $: repeats = recurrenceLabel(event);
  $: formattedDate      = campusDate(event?.start_time, { weekday: 'long', month: 'long', day: 'numeric' });
  $: formattedStartTime = campusTime(event?.start_time);
  $: formattedEndTime   = campusTime(event?.end_time);

  onMount(async () => {
    try {
      const { event: ev } = await getEvent(id);
      event = ev;

      // The organiser is worth showing, and an event that has one VIA cannot
      // load is still worth reading, so a failure here leaves the card out
      // rather than the page.
      try {
        const { rso: host } = await getRso(ev.rso_id);
        rso = host;
      } catch {
        rso = null;
      }
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(canonicalUrl);
      showToast('Link copied!');
    } catch {
      showToast('Could not copy link', 'error');
    }
  }

  async function toggleQr() {
    showQr = !showQr;
    if (showQr && !qrDataUrl) {
      qrDataUrl = await QRCode.toDataURL(canonicalUrl, { width: 200, margin: 2 });
    }
  }
</script>

<svelte:head>
  {#if event}
    <title>{event.title}: VIA</title>
    <meta name="description" content="{event.rso_name} · {formattedDate} · {locationLabel(event)}" />
  {:else}
    <title>Event: VIA</title>
  {/if}
</svelte:head>

<div class="max-w-3xl mx-auto space-y-4">

  <button
    class="text-sm text-muted-foreground hover:text-foreground transition-colors"
    on:click={() => navigate('/')}
  >← All events</button>

  {#if loading}
    <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3 animate-pulse">
      <div class="h-8 bg-muted rounded w-3/4"></div>
      <div class="h-4 bg-muted rounded w-1/3"></div>
      <div class="flex gap-2">
        <div class="h-5 bg-muted rounded-full w-16"></div>
        <div class="h-5 bg-muted rounded-full w-20"></div>
      </div>
    </div>
    <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-2 animate-pulse">
      <div class="h-4 bg-muted rounded w-1/2"></div>
      <div class="h-4 bg-muted rounded w-1/3"></div>
    </div>
    <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-2 animate-pulse">
      <div class="h-4 bg-muted rounded w-full"></div>
      <div class="h-4 bg-muted rounded w-5/6"></div>
      <div class="h-4 bg-muted rounded w-4/5"></div>
    </div>

  {:else if error}
    <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-2">
      <p class="text-destructive text-sm">{error}</p>
      <button class="text-sm text-muted-foreground hover:text-foreground" on:click={() => navigate('/')}>
        Back to events
      </button>
    </div>

  {:else if event}

    <!-- 1. Header card -->
    <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3">
      <div class="flex items-start justify-between gap-3">
        <h1 class="text-2xl font-bold leading-tight">{event.title}</h1>
        {#if event.is_private}
          <span class="text-xs bg-secondary text-secondary-foreground rounded px-2 py-1 shrink-0 mt-1">Private</span>
        {/if}
      </div>
      <div class="flex items-center gap-2">
        {#if rso}
          <span class="inline-block w-3 h-3 rounded-full shrink-0" style="background-color: {rso.logo_color}"></span>
        {/if}
        <span class="text-sm text-muted-foreground">{event.rso_name}</span>
      </div>
      {#if tags.length}
        <div class="flex flex-wrap gap-1.5">
          {#each tags as tag}
            <span class="text-xs border rounded-full px-2 py-0.5">{tag}</span>
          {/each}
        </div>
      {/if}
    </div>

    <!-- 2. Details strip -->
    <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-2">
      <div class="flex items-center gap-2 text-sm">
        <span>📅</span>
        <span>{formattedDate}, {formattedStartTime} to {formattedEndTime}</span>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <span>📍</span>
        <span>{locationLabel(event)}</span>
      </div>
      {#if repeats}
        <div class="flex items-center gap-2 text-sm">
          <span>🔁</span>
          <span>{repeats}</span>
        </div>
      {/if}
      {#if event.max_capacity}
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <span>👥</span>
          <span>Capacity: {event.max_capacity}</span>
        </div>
      {/if}
    </div>

    <!-- 3. Description card -->
    {#if event.description}
      <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border">
        <div class="text-sm text-muted-foreground leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1 [&_a]:underline [&_a]:underline-offset-2 [&_p]:mt-2 first:[&_p]:mt-0">
          {@html DOMPurify.sanitize(marked.parse(event.description))}
        </div>
      </div>
    {/if}

    <!-- 4. Hosted by card -->
    {#if rso}
      <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-2">
        <h2 class="text-base font-semibold">Hosted by</h2>
        <div class="flex items-center gap-2">
          <span class="inline-block w-4 h-4 rounded-full shrink-0" style="background-color: {rso.logo_color}"></span>
          <span class="font-medium">{rso.rso_name}</span>
          {#if rso.founded_year}
            <span class="text-xs text-muted-foreground">est. {rso.founded_year}</span>
          {/if}
        </div>
        {#if rso.description}
          <p class="text-sm text-muted-foreground leading-relaxed">{rso.description}</p>
        {/if}
        <p class="text-xs text-muted-foreground">
          {rso.event_count ?? 0} event{(rso.event_count ?? 0) !== 1 ? 's' : ''} on VIA
        </p>
      </div>
    {/if}

    <!-- 5. Share card -->
    <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3">
      <h2 class="text-base font-semibold">Share this event</h2>
      <p class="text-sm text-muted-foreground font-mono break-all">{canonicalUrl}</p>
      <div class="flex gap-2 flex-wrap">
        <button
          class="text-sm px-3 py-1.5 rounded border hover:bg-accent transition-colors"
          on:click={copyLink}
        >Copy link</button>
        <button
          class="text-sm px-3 py-1.5 rounded border hover:bg-accent transition-colors"
          on:click={toggleQr}
        >{showQr ? 'Hide QR code' : 'Create QR code'}</button>
      </div>
      {#if showQr && qrDataUrl}
        <img src={qrDataUrl} alt="QR code for {event.title}" class="w-40 h-40 rounded" />
      {/if}
    </div>

  {/if}
</div>
