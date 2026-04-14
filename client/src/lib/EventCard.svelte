<script>
  import { currentUser } from '../stores/auth.js';
  import { rsvpEvent } from '../api/events.js';
  import { showToast } from '../stores/ui.js';
  import { navigate } from '../lib/router.js';

  export let event;
  export let compact = false;

  $: tags = event.tags ? event.tags.split(',').filter(Boolean) : [];
  $: startDate = new Date(event.start_time);
  $: formattedDate = startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  $: formattedTime = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  let rsvpStatus = event.user_rsvp ?? null;
  let _trackedId = event.event_id;
  $: if (event.event_id !== _trackedId) { _trackedId = event.event_id; rsvpStatus = event.user_rsvp ?? null; }

  async function handleRsvp(status) {
    if (!$currentUser) { showToast('Sign in to RSVP', 'error'); return; }
    try {
      await rsvpEvent(event.event_id, status);
      rsvpStatus = status;
      showToast(status === 'Going' ? "You're going!" : `RSVP set to ${status}`);
    } catch (e) {
      showToast(e.message, 'error');
    }
  }
</script>

<div class="border rounded-lg p-4 hover:shadow-md transition-shadow bg-card {compact ? 'py-2' : ''}">
  <div class="flex items-start justify-between gap-2 mb-1">
    <a
      href="/events/{event.event_id}"
      on:click|preventDefault={() => navigate(`/events/${event.event_id}`)}
      class="font-semibold text-base leading-snug hover:underline underline-offset-2"
    >{event.title}</a>
    {#if event.is_private}
      <span class="text-xs bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 shrink-0">Private</span>
    {/if}
  </div>
  <p class="text-xs text-muted-foreground mb-2">{event.rso_name}</p>

  {#if !compact}
    {#if event.description}
      <p class="text-sm text-muted-foreground mb-2 line-clamp-2">{event.description}</p>
    {/if}
    <div class="text-sm space-y-1 mb-2">
      <p>📅 {formattedDate} at {formattedTime}</p>
      <p>📍 {event.building} {event.room_number}</p>
    </div>
    {#if tags.length}
      <div class="flex flex-wrap gap-1 mb-3">
        {#each tags as tag}
          <span class="text-xs border rounded-full px-2 py-0.5">{tag}</span>
        {/each}
      </div>
    {/if}
    <div class="flex gap-2">
      {#if rsvpStatus === 'Going'}
        <button class="text-sm px-3 py-1 rounded bg-secondary hover:bg-secondary/80 transition-colors" on:click={() => handleRsvp('Not Going')}>✓ Going</button>
      {:else}
        <button class="text-sm px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors" on:click={() => handleRsvp('Going')}>RSVP</button>
      {/if}
      <button class="text-sm px-3 py-1 rounded hover:bg-accent transition-colors" on:click={() => handleRsvp('Maybe')}>Maybe</button>
    </div>
  {/if}
</div>
