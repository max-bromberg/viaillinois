<script>
  import { createEventDispatcher } from 'svelte';

  export let rsos = [];

  const dispatch = createEventDispatcher();

  const ALL_TAGS = ['Free Food', 'Workshop', 'Social', 'Corporate', 'Competition', 'Weekly Meeting', 'Speaker', 'Networking'];

  let keyword = '';
  let selectedTags = [];
  let startDate = '';
  let endDate = '';
  let selectedRsoIds = [];
  let showInternal = true;
  let panelOpen = false;

  function notifyChange() {
    dispatch('change', { keyword, tags: selectedTags, startDate, endDate, selectedRsoIds, showInternal });
  }

  function toggleTag(tag) {
    selectedTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    notifyChange();
  }

  function toggleRso(rsoId) {
    selectedRsoIds = selectedRsoIds.includes(rsoId)
      ? selectedRsoIds.filter(id => id !== rsoId)
      : [...selectedRsoIds, rsoId];
    notifyChange();
  }

  function clearFilters() {
    keyword = '';
    selectedTags = [];
    startDate = '';
    endDate = '';
    selectedRsoIds = [];
    showInternal = true;
    notifyChange();
  }

  $: isFilterActive = keyword || selectedTags.length || startDate || endDate || selectedRsoIds.length || !showInternal;
</script>

<aside class="w-full md:w-56 md:shrink-0 bg-card rounded-lg border">
  <!-- Mobile toggle button -->
  <button
    class="md:hidden w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium"
    on:click={() => panelOpen = !panelOpen}
  >
    <span>Filters{#if isFilterActive} <span class="text-primary font-bold">·</span>{/if}</span>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      style="transition: transform 0.2s; transform: rotate({panelOpen ? 180 : 0}deg)">
      <path d="m6 9 6 6 6-6"/>
    </svg>
  </button>

  <!-- Panel: always visible on md+, toggled on mobile -->
  <div class="{panelOpen ? 'block' : 'hidden'} md:block p-3 space-y-4">
    <div class="space-y-1">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Search</p>
      <input
        type="text"
        placeholder="Keyword…"
        bind:value={keyword}
        on:input={notifyChange}
        class="w-full h-8 text-sm border rounded px-2 bg-background"
      />
    </div>

    <div class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</p>
      <div class="flex flex-wrap gap-1">
        {#each ALL_TAGS as tag}
          <button on:click={() => toggleTag(tag)}
            class="text-xs border rounded-full px-2 py-0.5 cursor-pointer transition-colors
              {selectedTags.includes(tag) ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}">
            {tag}
          </button>
        {/each}
      </div>
    </div>

    <div class="space-y-1">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date range</p>
      <input type="date" bind:value={startDate} on:change={notifyChange} class="w-full h-8 text-sm border rounded px-2 bg-background" />
      <input type="date" bind:value={endDate}   on:change={notifyChange} class="w-full h-8 text-sm border rounded px-2 bg-background" />
    </div>

    {#if rsos.length > 0}
      <div class="space-y-1">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">RSOs</p>
        <div class="space-y-1">
          {#each rsos as rso}
            <label class="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={selectedRsoIds.includes(rso.rso_id)}
                on:change={() => toggleRso(rso.rso_id)}
                class="w-3 h-3"
              />
              <span
                class="w-2.5 h-2.5 rounded-sm flex-shrink-0 inline-block"
                style="background-color: {rso.logo_color || '#6b7280'};"
              ></span>
              <span>{rso.name}</span>
            </label>
          {/each}
        </div>
      </div>
    {/if}

    <div class="space-y-1">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Show</p>
      <label class="flex items-center gap-1.5 text-xs cursor-pointer">
        <input
          type="checkbox"
          bind:checked={showInternal}
          on:change={notifyChange}
          class="w-3 h-3"
        />
        <span>Internal events</span>
      </label>
    </div>

    {#if isFilterActive}
      <button class="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1" on:click={clearFilters}>
        Clear filters
      </button>
    {/if}
  </div>
</aside>
