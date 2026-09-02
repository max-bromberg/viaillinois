<script>
  import { locationLabel } from './locationLabel.js';
  import { campusDate, campusTime } from './campusTime.js';
  import { currentUser } from '../stores/auth.js';
  import { navigate } from '../lib/router.js';

  export let event;
  export let compact = false;
  export let rsoColor = null;
  export let rsoId = null;

  // Location is hidden for internal events unless the viewer is a member of that RSO
  // (or a global admin). Time + RSO name is enough to identify conflicts for outsiders.
  $: canSeeLocation = !event.is_private
    || $currentUser?.is_global_admin
    || $currentUser?.memberships?.some(m => m.rso_id === rsoId);

  $: tags = event.tags ? event.tags.split(',').filter(Boolean) : [];
  $: formattedDate = campusDate(event.start_time);
  $: formattedTime = campusTime(event.start_time);
</script>

<div class="border rounded-lg overflow-hidden hover:shadow-md transition-shadow bg-card flex">
  {#if rsoColor}
    <div class="w-1 shrink-0" style="background-color: {rsoColor}"></div>
  {/if}
  <div class="flex-1 p-4 min-w-0 {compact ? 'py-2' : ''}">
  <div class="flex items-start justify-between gap-2 mb-1">
    <a
      href="/events/{event.event_id}"
      on:click|preventDefault={() => navigate(`/events/${event.event_id}`)}
      class="font-semibold text-base leading-snug hover:underline underline-offset-2"
    >{event.title}</a>
    {#if event.is_private}
      <span class="text-xs bg-orange-500/15 text-orange-700 dark:text-orange-400 rounded px-1.5 py-0.5 shrink-0">Internal</span>
    {/if}
  </div>
  <p class="text-xs text-muted-foreground mb-2">{event.rso_name}</p>

  {#if !compact}
    {#if event.description}
      <p class="text-sm text-muted-foreground mb-2 line-clamp-2">{event.description}</p>
    {/if}
    <div class="text-sm space-y-1 mb-2">
      <p>📅 {formattedDate} at {formattedTime}</p>
      {#if canSeeLocation}
        <p>📍 {locationLabel(event)}</p>
      {/if}
    </div>
    {#if tags.length}
      <div class="flex flex-wrap gap-1">
        {#each tags as tag}
          <span class="text-xs border rounded-full px-2 py-0.5">{tag}</span>
        {/each}
      </div>
    {/if}
  {/if}
  </div>
</div>
