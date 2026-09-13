<script>
  /**
   * The whole page, before the answer to who is looking has come back.
   *
   * It draws the shapes the feed is about to be: the band, the rail and the
   * rows, in well colour, with nothing moving. The rows settle into place when
   * they arrive, which is the movement that says the agenda has just come.
   */
  import NavBarSkeleton from './NavBarSkeleton.svelte';
  import EventCardSkeleton from './EventCardSkeleton.svelte';
</script>

<NavBarSkeleton />

<div class="shell">
  <main class="page">
    <div class="rail" aria-hidden="true">
      {#each Array(4) as _, at (at)}
        <div>
          <div class="ghost head"></div>
          <div class="ghost row"></div>
          <div class="ghost row"></div>
        </div>
      {/each}
    </div>

    <div class="agenda">
      <div class="ghost head wide" aria-hidden="true"></div>
      {#each Array(6) as _, at (at)}
        <EventCardSkeleton />
      {/each}
    </div>
  </main>
</div>

<style>
  .shell {
    min-height: 100vh;
    background: var(--paper);
    color: var(--ink);
  }

  .page {
    max-width: 1180px;
    margin: 0 auto;
  }

  .agenda {
    display: grid;
    gap: 6px;
    align-content: start;
    min-width: 0;
  }

  .ghost {
    background: var(--well);
    display: block;
  }

  .head {
    height: 16px;
    width: 70%;
    margin-bottom: 10px;
  }

  .head.wide {
    height: 22px;
    width: 160px;
    margin-bottom: 14px;
  }

  .row {
    height: 14px;
    width: 90%;
    margin-top: 8px;
  }
</style>
