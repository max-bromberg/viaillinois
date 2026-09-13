<script>
  import { searchVenues } from '../api/venues.js';
  import { Field, Button, Icon, Pad } from './components/ui/index.js';

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

  // The field exposes bind:value rather than forwarding on:input, so the search
  // is driven by the value changing.
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

<div class="place">
  {#if chosenLabel}
    <span class="name">Location</span>
    <p class="chosen">
      <Icon name="pin" />
      <span>{chosenLabel}</span>
    </p>
    <Button variant="quiet" size="sm" onclick={clear}>Clear the location</Button>
  {:else}
    <Field
      label="Location"
      id="location-search"
      bind:value={term}
      placeholder="Room, building or building code, or anywhere else"
      autocomplete="off"
      help="Optional. Leave it empty if the location is not decided yet."
      class="wide"
    />

    {#if searching}
      <p class="quiet">Searching for a room.</p>
    {:else if error}
      <p class="wrong">{error}</p>
    {:else if searched}
      {#if results.length}
        <ul class="rooms">
          {#each results as room (room.location_id)}
            <li>
              <button type="button" class="room" on:click={() => chooseRoom(room)}>
                <Pad hollow />
                <span class="where">{roomLabel(room)}</span>
                <span class="seats mono">seats {room.max_capacity}</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="quiet">No room matches that.</p>
      {/if}
    {/if}

    <!--
      Offered as soon as anything is typed, rather than only after a search has
      come back. A location that is not a room is the reason this field exists,
      and making it depend on a network round trip means it disappears exactly
      when the network is the thing that failed.
    -->
    {#if term.trim()}
      <Button variant="quiet" size="sm" onclick={chooseFreeText}>
        Use "{term.trim()}" as the location
      </Button>
    {/if}
  {/if}
</div>

<style>
  .place {
    display: grid;
    gap: 10px;
    justify-items: start;
  }

  .place :global(.fld.wide) {
    max-width: 560px;
  }

  .name {
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 700;
    font-size: 14px;
  }

  /*
   * A chosen room is the pin and the words, on paper. It was a rounded
   * rectangle with a hairline around it and a pin emoji, which drew differently
   * on every platform the site is read on.
   */
  .chosen {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    color: var(--ink);
  }

  .quiet {
    font-size: 12.5px;
    color: var(--muted);
  }

  /* An error is a sentence in the danger colour, never a red box. */
  .wrong {
    font-size: 12.5px;
    color: var(--danger);
  }

  /*
   * The results are a listing, the way the exam listing is a listing: hairlines
   * between the rows and nothing around the outside.
   */
  .rooms {
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
    max-width: 560px;
    max-height: 224px;
    overflow-y: auto;
  }

  .rooms li + li .room {
    border-top: 1px solid var(--line);
  }

  .room {
    font: inherit;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    background: none;
    border: 0;
    padding: 9px 4px;
    min-height: 32px;
    color: var(--ink);
    cursor: pointer;
  }

  .room:hover .where,
  .room:focus-visible .where {
    color: var(--primary);
  }

  .room:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  .where {
    flex: 1;
  }

  .seats {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--muted);
  }
</style>
