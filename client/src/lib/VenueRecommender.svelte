<script>
  import { createEventDispatcher } from 'svelte';
  import { recommendVenue } from '../api/venues.js';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';

  export let startTime;
  export let endTime;

  const dispatch = createEventDispatcher();

  let attendance = 30;
  let requiresAV = false;
  let venues = [];
  let loading = false;
  let searched = false;
  let error = null;

  async function search() {
    loading = true;
    error = null;
    try {
      const result = await recommendVenue({ attendance, startTime, endTime, requiresAV });
      venues = result.venues;
      searched = true;
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
</script>

<div class="border rounded-lg p-4 bg-muted/30 space-y-4">
  <h3 class="font-semibold text-sm">Venue Recommender</h3>

  <div class="grid grid-cols-2 gap-4">
    <div class="space-y-1">
      <Label htmlFor="attendance">Expected Attendance</Label>
      <Input
        id="attendance"
        type="number"
        min="1"
        bind:value={attendance}
        placeholder="30"
      />
    </div>

    <div class="flex items-end pb-2">
      <label class="flex items-center gap-2 cursor-pointer text-sm">
        <input
          type="checkbox"
          bind:checked={requiresAV}
          class="rounded border-gray-300 text-primary focus:ring-primary"
        />
        Requires A/V equipment
      </label>
    </div>
  </div>

  <Button
    variant="outline"
    size="sm"
    on:click={search}
    disabled={loading || !startTime || !endTime}
  >
    {loading ? 'Searching…' : 'Find venues'}
  </Button>

  {#if !startTime || !endTime}
    <p class="text-xs text-muted-foreground">Set start and end times above to search venues.</p>
  {/if}

  {#if error}
    <p class="text-sm text-destructive">{error}</p>
  {/if}

  {#if searched}
    {#if venues.length === 0}
      <p class="text-sm text-muted-foreground">No available venues found.</p>
    {:else}
      <ul class="space-y-2">
        {#each venues as venue}
          <li>
            <button
              type="button"
              class="w-full text-left border rounded-md p-3 hover:bg-accent hover:border-primary transition-colors text-sm"
              on:click={() => dispatch('select', venue)}
            >
              <div class="flex items-center justify-between">
                <span class="font-medium">{venue.building} {venue.room_number}</span>
                <div class="flex items-center gap-2">
                  {#if venue.has_av_equipment}
                    <span class="text-xs bg-secondary text-secondary-foreground rounded px-1.5 py-0.5">A/V</span>
                  {/if}
                  <span class="text-xs text-muted-foreground">Cap: {venue.max_capacity}</span>
                </div>
              </div>
              {#if venue.capacity_overhead != null}
                <p class="text-xs text-muted-foreground mt-0.5">
                  {venue.capacity_overhead > 0
                    ? `${venue.capacity_overhead} seats to spare`
                    : 'Exactly fits your group'}
                </p>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>
