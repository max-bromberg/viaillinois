<script>
  import { createEventDispatcher } from 'svelte';

  /**
   * The pager under the agenda.
   *
   * The feed serves eighteen events a page. The pager is words and numerals in
   * the display face, with the page you are on marked by weight and by what it
   * reports rather than by a filled tile, because a number in a filled tile was
   * one of the marks the redesign set out to remove.
   */
  export let currentPage;
  export let totalPages;

  const dispatch = createEventDispatcher();

  function getPageWindow(current, total) {
    const pages = new Set([1, total]);
    for (let i = current - 2; i <= current + 2; i += 1) {
      if (i >= 1 && i <= total) pages.add(i);
    }
    const sorted = [...pages].sort((a, b) => a - b);

    // A gap of more than one page between two entries is shown as a gap.
    const result = [];
    for (let i = 0; i < sorted.length; i += 1) {
      if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('gap');
      result.push(sorted[i]);
    }
    return result;
  }

  $: pageWindow = getPageWindow(currentPage, totalPages);
</script>

{#if totalPages > 1}
  <nav class="pager" aria-label="Pages of the agenda">
    <button
      class="step"
      disabled={currentPage === 1}
      on:click={() => dispatch('change', currentPage - 1)}
      aria-label="The page before this one"
    >Back</button>

    {#each pageWindow as item, at (at)}
      {#if item === 'gap'}
        <span class="gap" aria-hidden="true">to</span>
      {:else}
        <button
          class="page"
          class:here={item === currentPage}
          aria-current={item === currentPage ? 'page' : undefined}
          aria-label="Page {item}"
          on:click={() => dispatch('change', item)}
        >{item}</button>
      {/if}
    {/each}

    <button
      class="step"
      disabled={currentPage === totalPages}
      on:click={() => dispatch('change', currentPage + 1)}
      aria-label="The page after this one"
    >Next</button>
  </nav>
{/if}

<style>
  .pager {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    margin: 18px 0;
  }

  .pager button {
    font: inherit;
    font-family: var(--display);
    font-stretch: 85%;
    font-weight: 700;
    font-size: 14px;
    background: none;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    /* A 32 px target, like every other control on the site. */
    min-width: 32px;
    min-height: 32px;
  }

  .pager button:hover:not(:disabled) {
    color: var(--ink);
  }

  .pager button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  .pager button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  /*
   * The page you are on is the one thing set in ink, at the weight the display
   * face keeps for what should be read first, and it is underlined by the same
   * gradient the rail uses for the timeframe it is showing.
   */
  .here {
    color: var(--ink);
    font-weight: 800;
    font-stretch: 75%;
    font-size: 17px;
    position: relative;
  }

  .here::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 2px;
    height: 3px;
    background: var(--g-current);
    border-radius: 2px;
  }

  .gap {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--muted);
    user-select: none;
  }
</style>
