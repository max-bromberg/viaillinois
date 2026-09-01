<script>
  import { createEventDispatcher } from 'svelte';
  import { locationLabel } from './locationLabel.js';
  import { campusDateTime } from './campusTime.js';

  export let midterm;
  /** Global admins and RSO board members may remove an entry from the schedule. */
  export let canDelete = false;

  const dispatch = createEventDispatcher();

  let confirming = false;

  $: formatted = campusDateTime(midterm.start_time);
</script>

<tr class="border-b bg-card hover:bg-muted/50 transition-colors">
  <td class="py-3 px-4">
    <p class="font-medium text-sm">{midterm.title}</p>
    <p class="text-xs text-muted-foreground">{midterm.course_code}: {midterm.course_title}</p>
  </td>
  <td class="py-3 px-4 text-sm">{formatted}</td>
  <td class="py-3 px-4 text-sm">{locationLabel(midterm)}</td>
  <td class="py-3 px-4">
    <!-- Status badge: use plain span with conditional styling, where 'Confirmed' gets the primary look, others get secondary -->
    <span class="text-xs px-1.5 py-0.5 rounded {midterm.status === 'Confirmed' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}">{midterm.status}</span>
  </td>
  {#if canDelete}
    <td class="py-3 px-4 text-right whitespace-nowrap">
      {#if confirming}
        <span class="inline-flex items-center gap-1.5">
          <button
            class="px-2.5 py-1 text-xs bg-destructive text-white rounded-md hover:bg-destructive/90 transition-colors"
            on:click={() => { confirming = false; dispatch('delete', { midterm_id: midterm.midterm_id }); }}
          >Yes, delete</button>
          <button
            class="px-2.5 py-1 text-xs border border-input rounded-md hover:bg-accent transition-colors"
            on:click={() => confirming = false}
          >Cancel</button>
        </span>
      {:else}
        <button
          class="px-2.5 py-1 text-xs border border-destructive/50 text-destructive rounded-md hover:bg-destructive/10 transition-colors"
          on:click={() => confirming = true}
        >Delete</button>
      {/if}
    </td>
  {/if}
</tr>
