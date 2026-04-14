<script>
  import { createEventDispatcher } from 'svelte';

  export let currentPage;
  export let totalPages;

  const dispatch = createEventDispatcher();

  function getPageWindow(current, total) {
    const pages = new Set([1, total]);
    for (let i = current - 2; i <= current + 2; i++) {
      if (i >= 1 && i <= total) pages.add(i);
    }
    const sorted = [...pages].sort((a, b) => a - b);

    // Insert ellipsis markers where the gap between adjacent entries is > 1
    const result = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
      result.push(sorted[i]);
    }
    return result;
  }

  $: pageWindow = getPageWindow(currentPage, totalPages);
</script>

{#if totalPages > 1}
  <nav class="flex items-center justify-center gap-1" aria-label="Pagination">
    <button
      class="px-2 py-1 rounded text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent"
      disabled={currentPage === 1}
      on:click={() => dispatch('change', currentPage - 1)}
      aria-label="Previous page"
    >
      ‹
    </button>

    {#each pageWindow as item}
      {#if item === '…'}
        <span class="px-2 py-1 text-sm text-muted-foreground select-none">…</span>
      {:else}
        <button
          class="min-w-[2rem] px-2 py-1 rounded text-sm transition-colors
            {item === currentPage
              ? 'bg-primary text-primary-foreground font-medium'
              : 'hover:bg-accent'}"
          aria-current={item === currentPage ? 'page' : undefined}
          on:click={() => dispatch('change', item)}
        >
          {item}
        </button>
      {/if}
    {/each}

    <button
      class="px-2 py-1 rounded text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent"
      disabled={currentPage === totalPages}
      on:click={() => dispatch('change', currentPage + 1)}
      aria-label="Next page"
    >
      ›
    </button>
  </nav>
{/if}
