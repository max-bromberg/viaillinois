<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  const ALL_TAGS = ['Free Food', 'Workshop', 'Social', 'Corporate', 'Competition', 'Weekly Meeting', 'Speaker', 'Networking'];

  let keyword = '';
  let selectedTags = [];
  let startDate = '';
  let endDate = '';

  function notifyChange() {
    dispatch('change', { keyword, tags: selectedTags, startDate, endDate });
  }

  function toggleTag(tag) {
    selectedTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    notifyChange();
  }

  function clearFilters() {
    keyword = '';
    selectedTags = [];
    startDate = '';
    endDate = '';
    notifyChange();
  }
</script>

<aside class="space-y-4 w-56 shrink-0">
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

  {#if selectedTags.length || keyword || startDate || endDate}
    <button class="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1" on:click={clearFilters}>
      Clear filters
    </button>
  {/if}
</aside>
