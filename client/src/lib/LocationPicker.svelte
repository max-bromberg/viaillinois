<script>
  import { searchVenues } from '../api/venues.js';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';

  /** Label of a location already chosen, shown instead of the search box. */
  export let initialLabel = '';
  /** Wait after the last keystroke before searching. Tests set this to zero. */
  export let debounceMs = 200;
  /**
   * Called with the chosen location. Svelte 5 removed the component event
   * API that the venue finder this replaces was written against, so this is a
   * plain callback rather than a dispatched event.
   *
   * @type {(choice: {location_id: number|null, location_text: string|null, label: string}) => void}
   */
  export let onChange = () => {};

  let term = '';
  let results = [];
  let searching = false;
  let searched = false;
  let error = null;
  let chosenLabel = initialLabel;
  let timer;

  const roomLabel = (room) => `${room.building} ${room.room_number}`;

  // The shared Input component exposes bind:value rather than forwarding
  // on:input, so the search is driven by the value changing.
  $: schedule(term);

  function schedule(value) {
    clearTimeout(timer);
    searched = false;
    results = [];
    error = null;
    if (!value.trim()) return;
    timer = setTimeout(run, debounceMs);
  }

  async function run() {
    const q = term.trim();
    if (!q) return;
    searching = true;
    try {
      const { locations } = await searchVenues(q);
      results = locations;
      searched = true;
    } catch (e) {
      error = e.message;
    } finally {
      searching = false;
    }
  }

  function chooseRoom(room) {
    chosenLabel = roomLabel(room);
    onChange({ location_id: room.location_id, location_text: null, label: chosenLabel });
  }

  function chooseFreeText() {
    const text = term.trim();
    chosenLabel = text;
    onChange({ location_id: null, location_text: text, label: text });
  }

  function clear() {
    chosenLabel = '';
    term = '';
    results = [];
    searched = false;
    onChange({ location_id: null, location_text: null, label: '' });
  }
</script>

<div class="space-y-2">
  <Label htmlFor="location-search">Location</Label>

  {#if chosenLabel}
    <div class="flex items-center gap-2 text-sm">
      <span class="rounded-md border px-2 py-1">📍 {chosenLabel}</span>
      <button type="button" class="text-xs text-muted-foreground hover:text-foreground" on:click={clear}>
        clear
      </button>
    </div>
  {:else}
    <Input
      id="location-search"
      bind:value={term}
      placeholder="Room, building or building code, or anywhere else"
      autocomplete="off"
    />

    {#if searching}
      <p class="text-xs text-muted-foreground">Searching...</p>
    {:else if error}
      <p class="text-xs text-destructive">{error}</p>
    {:else if searched}
      {#if results.length}
        <ul class="border rounded-md divide-y max-h-56 overflow-y-auto">
          {#each results as room (room.location_id)}
            <li>
              <button
                type="button"
                class="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                on:click={() => chooseRoom(room)}
              >
                {roomLabel(room)}
                <span class="text-xs text-muted-foreground ml-2">seats {room.max_capacity}</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-xs text-muted-foreground">No room matches that.</p>
      {/if}
    {/if}

    <!--
      Offered as soon as anything is typed, rather than only after a search has
      come back. A location that is not a room is the reason this field exists,
      and making it depend on a network round trip means it disappears exactly
      when the network is the thing that failed.
    -->
    {#if term.trim()}
      <button
        type="button"
        class="text-xs underline text-muted-foreground hover:text-foreground"
        on:click={chooseFreeText}
      >
        Use "{term.trim()}" as the location
      </button>
    {/if}

    <p class="text-xs text-muted-foreground">
      Optional. Leave it empty if the location is not decided yet.
    </p>
  {/if}
</div>
