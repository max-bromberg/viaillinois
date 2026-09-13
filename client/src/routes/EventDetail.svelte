<script>
  import { onMount } from 'svelte';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import QRCode from 'qrcode';
  import { Poster, Pad, Button } from '../lib/components/ui/index.js';
  import { getEvent } from '../api/events.js';
  import { getRso } from '../api/rsos.js';
  import { locationLabel } from '../lib/locationLabel.js';
  import { calendarFileFor } from '../lib/calendarFile.js';
  import { recurrenceLabel } from '../lib/recurrenceLabel.js';
  import { campusDate, campusTime, toInstant } from '../lib/campusTime.js';
  import { organizationColors } from '../lib/organizationColor.js';
  import { resolvedTheme } from '../stores/theme.js';
  import { navigate } from '../lib/router.js';
  import { showToast } from '../stores/ui.js';

  /**
   * The event page.
   *
   * A poster, as docs/design/08-surfaces.md asks for: the organization's light
   * across the top, the title at poster size, the time as a number you could
   * read from the door, and the actions down the right with no box around them.
   *
   * The poster carries what a passer by needs. What the platform knows beyond
   * that, the description as it was written, how the event repeats, how many
   * people said they were interested, how much room there is, and who is
   * hosting, is set below it in the same measure.
   */
  export let id;

  let event     = null;
  let rso       = null;
  let loading   = true;
  let error     = null;
  let qrDataUrl = '';

  $: canonicalUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/events/${id}`
    : `/events/${id}`;
  $: repeats = recurrenceLabel(event);
  $: formattedDate      = campusDate(event?.start_time, { weekday: 'long', month: 'long', day: 'numeric' });
  $: formattedStartTime = campusTime(event?.start_time);
  // The count that stands in for the RSVPs that were removed. Nothing is said
  // until somebody has shown interest, because a zero reads as a verdict.
  $: interestSentence = !event?.interest_count ? null
    : event.interest_count === 1 ? '1 person is interested'
    : `${event.interest_count} people are interested`;

  $: hostColors = organizationColors(rso?.logo_color, $resolvedTheme);

  /**
   * The event as the poster reads it.
   *
   * The poster prints a room and the building under it. A location is optional
   * on VIA and takes three forms, so what goes in the room slot is the one
   * sentence the rest of the site already writes for all three, and the
   * organizer's note about the door goes under it where the building name sits.
   *
   * The description is held back, because the poster sets plain paragraphs and
   * organizers write markdown.
   */
  $: posterEvent = event && {
    ...event,
    rso_color: rso?.logo_color ?? null,
    building: locationLabel(event),
    room_number: null,
    building_name: event.location_note ?? null,
    description: null,
  };

  $: descriptionHtml = event?.description
    ? DOMPurify.sanitize(marked.parse(event.description))
    : '';

  /** The sentences the poster has no place for, in the order they matter. */
  $: alsoTrue = event ? [
    repeats,
    interestSentence,
    event.max_capacity ? `There is room for ${event.max_capacity} people.` : null,
    event.is_private ? `This event is internal to ${event.rso_name} and is not listed publicly.` : null,
  ].filter(Boolean) : [];

  onMount(async () => {
    try {
      const { event: ev } = await getEvent(id);
      event = ev;

      // The organiser is worth showing, and an event that has one VIA cannot
      // load is still worth reading, so a failure here leaves the host out
      // rather than the page.
      try {
        const { rso: host } = await getRso(ev.rso_id);
        rso = host;
      } catch {
        rso = null;
      }

      // The poster draws the code beside the link, so it is made as soon as
      // there is something to encode. A browser that cannot draw it leaves the
      // block where it is and the link is still there to copy.
      try {
        qrDataUrl = await QRCode.toDataURL(canonicalUrl, { width: 200, margin: 2 });
      } catch {
        qrDataUrl = '';
      }
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  });

  /** A time as a calendar file writes it. */
  const stamp = value => {
    const at = toInstant(value);
    return at ? at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') : '';
  };

  function googleCalendarUrl() {
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.title,
      dates: `${stamp(event.start_time)}/${stamp(event.end_time ?? event.start_time)}`,
      details: `${event.rso_name} on VIA. ${canonicalUrl}`,
      location: locationLabel(event),
    });
    return `https://calendar.google.com/calendar/render?${params}`;
  }

  /** Hand a file to the reader without leaving the page. */
  function save(name, href) {
    const link = document.createElement('a');
    link.href = href;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(canonicalUrl);
      showToast('Link copied.');
    } catch {
      showToast('The link could not be copied.', 'error');
    }
  }

  /** What each of the poster's actions does. */
  function addToCalendar() {
    try {
      window.open(googleCalendarUrl(), '_blank', 'noopener');
    } catch {
      showToast('Google Calendar could not be opened.', 'error');
    }
  }

  function downloadCalendarFile() {
    save(
      `via-event-${event.event_id}.ics`,
      `data:text/calendar;charset=utf-8,${encodeURIComponent(calendarFileFor(event, { url: canonicalUrl }))}`,
    );
  }

  function downloadCode() {
    if (!qrDataUrl) {
      showToast('The QR code is not ready yet.', 'error');
      return;
    }
    save(`via-event-${event.event_id}.png`, qrDataUrl);
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

{#if loading}
  <!-- The shape of the poster in well colour, with no shimmer. -->
  <div class="waiting" aria-hidden="true">
    <div class="block back"></div>
    <div class="block title"></div>
    <div class="block org"></div>
    <div class="block when"></div>
    <div class="block line"></div>
    <div class="block line short"></div>
  </div>

{:else if error}
  <p class="bad">This event did not load. Try again in a moment.</p>
  <p class="why">{error}</p>
  <p class="way"><Button variant="quiet" onclick={() => navigate('/')}>Back to the event feed</Button></p>

{:else if event}
  {#if event.cancelled_at}
    <!-- Above everything else, because it changes what everything else means. -->
    <p class="called-off">
      <b>This event was cancelled.</b>
      It was scheduled for {formattedDate} at {formattedStartTime}. The details below are kept for reference.
    </p>
  {/if}

  <Poster
    event={posterEvent}
    theme={$resolvedTheme}
    url={canonicalUrl}
    onnavigate={navigate}
    onaddToCalendar={addToCalendar}
    ondownloadCalendarFile={downloadCalendarFile}
    oncopyLink={copyLink}
    ondownloadCode={downloadCode}
    onmakePoster={() => navigate(`/poster?event=${event.event_id}`)}
  >
    <!--
      The poster sets the measure and the ink; the page dresses what an organizer
      wrote inside it, which is the space between paragraphs, the bullets on a
      list and the colour of a link. The rules below name this container, so it
      has to be here for a description to get any of it.
    -->
    {#snippet describe()}
      {#if descriptionHtml}<div class="read">{@html descriptionHtml}</div>{/if}
    {/snippet}

    {#snippet code()}
      {#if qrDataUrl}
        <img class="qr code" src={qrDataUrl} alt="A code that opens this page on a phone" />
      {:else}
        <div class="qr" aria-hidden="true"></div>
      {/if}
    {/snippet}
  </Poster>

  <div class="below">
    {#if alsoTrue.length}
      <div class="also">
        {#each alsoTrue as said (said)}<p>{said}</p>{/each}
      </div>
    {/if}

    {#if rso}
      <section class="host">
        <h2>Hosted by</h2>
        <p class="who">
          <Pad tone={hostColors.mark} />
          <b style="color: {hostColors.text}">{rso.rso_name}</b>
          {#if rso.founded_year}<span>Founded in {rso.founded_year}</span>{/if}
        </p>
        {#if rso.description}<p class="txt">{rso.description}</p>{/if}
        <p class="count">
          {rso.event_count ?? 0} event{(rso.event_count ?? 0) !== 1 ? 's' : ''} on VIA
        </p>
      </section>
    {/if}
  </div>
{/if}

<style>
  /* The shape of the poster while it is on its way, in well colour. */
  .waiting {
    display: grid;
    gap: 14px;
    justify-items: start;
    padding-top: 10px;
  }

  .block {
    background: var(--well);
  }

  .block.back  { width: 110px; height: 14px; }
  .block.title { width: min(100%, 560px); height: 76px; }
  .block.org   { width: 260px; height: 17px; }
  .block.when  { width: 380px; height: 56px; }
  .block.line  { width: min(100%, 58ch); height: 15px; }
  .block.line.short { width: min(100%, 36ch); }

  /* An error is a sentence in danger text, never a red box. */
  .bad {
    color: var(--danger);
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 700;
    font-size: 18px;
  }

  .why {
    color: var(--muted);
    font-size: 14px;
    margin-top: 6px;
  }

  .way {
    margin-top: 16px;
  }

  .called-off {
    color: var(--danger);
    font-size: 14.5px;
    max-width: 58ch;
    padding: 0 28px 10px;
  }

  .called-off b {
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 800;
  }

  /* The code the poster draws beside the link. */
  .code {
    width: 96px;
    height: 96px;
    display: block;
    background: none;
    opacity: 1;
  }

  .below {
    padding: 0 28px;
    display: grid;
    gap: 26px;
    justify-items: start;
  }

  /* The same measure and the same ink the poster sets its own paragraphs in. */
  .txt {
    max-width: 58ch;
    color: var(--ink-2);
    font-size: 15.5px;
  }

  .read :global(p + p),
  .read :global(ul),
  .read :global(ol) {
    margin-top: 10px;
  }

  .read :global(h1),
  .read :global(h2),
  .read :global(h3) {
    font-family: var(--display);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 22px;
    color: var(--ink);
    margin-top: 16px;
  }

  .read :global(strong) {
    color: var(--ink);
  }

  .read :global(ul) { list-style: disc; padding-left: 20px; }
  .read :global(ol) { list-style: decimal; padding-left: 20px; }
  .read :global(li) { margin-top: 4px; }

  .read :global(a) {
    color: var(--primary);
    text-underline-offset: 2px;
  }

  .also {
    display: grid;
    gap: 6px;
    color: var(--ink-2);
    font-size: 14.5px;
    max-width: 58ch;
  }

  .host h2 {
    font-family: var(--display);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 18px;
    margin-bottom: 10px;
  }

  .host .who {
    display: flex;
    gap: 12px;
    align-items: center;
    font-size: 15px;
    color: var(--ink-2);
  }

  .host .who b {
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 800;
    font-size: 17px;
  }

  .host .txt {
    margin-top: 10px;
  }

  .host .count {
    margin-top: 8px;
    font-family: var(--mono);
    font-size: 12.5px;
    color: var(--muted);
  }
</style>
