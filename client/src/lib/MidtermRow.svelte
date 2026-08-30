<script>
  import { createEventDispatcher } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { currentUser } from '../stores/auth.js';

  export let midterm;
  export let userVote = null; // 1, -1, or null

  const dispatch = createEventDispatcher();
  $: start = new Date(midterm.start_time);
  $: formatted = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
</script>

<tr class="border-b bg-card hover:bg-muted/50 transition-colors">
  <td class="py-3 px-4">
    <p class="font-medium text-sm">{midterm.title}</p>
    <p class="text-xs text-muted-foreground">{midterm.course_code}: {midterm.course_title}</p>
  </td>
  <td class="py-3 px-4 text-sm">{formatted}</td>
  <td class="py-3 px-4 text-sm">{midterm.building} {midterm.room_number}</td>
  <td class="py-3 px-4">
    <!-- Status badge: use plain span with conditional styling, where 'Confirmed' gets the primary look, others get secondary -->
    <span class="text-xs px-1.5 py-0.5 rounded {midterm.status === 'Confirmed' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}">{midterm.status}</span>
  </td>
  <td class="py-3 px-4">
    <div class="flex items-center gap-2">
      <span class="text-sm font-mono w-6 text-center">{midterm.score ?? 0}</span>
      {#if $currentUser}
        <Button size="sm" variant={userVote === 1 ? 'default' : 'outline'} class="h-7 w-7 p-0" on:click={() => dispatch('vote', 1)}>▲</Button>
        <Button size="sm" variant={userVote === -1 ? 'destructive' : 'outline'} class="h-7 w-7 p-0" on:click={() => dispatch('vote', -1)}>▼</Button>
      {/if}
    </div>
  </td>
</tr>
