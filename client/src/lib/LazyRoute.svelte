<script>
  /**
   * A page fetched when it is first opened.
   *
   * Every page used to be in the first download, so a student opening the feed
   * paid for the logistics dashboard, the scheduler and the poster designer
   * before seeing an event. Each page is its own file now, and the browser
   * asks for one when somebody goes there.
   *
   * @type {() => Promise<{ default: any }>}
   */
  export let load;
  /** Props for the page, for the routes that take one. */
  export let props = {};

  // Called once, when this route is opened. The surrounding page redraws on
  // every navigation and every toast, and re-reading a module each time would
  // restart the await block and blank the page that is already on screen.
  const page = load().then(module => module.default);
</script>

{#await page then Page}
  <svelte:component this={Page} {...props} />
{:catch}
  <div class="rounded-xl border bg-card p-6 space-y-2">
    <p class="text-sm">This page could not be loaded.</p>
    <p class="text-sm text-muted-foreground">
      VIA was updated while this tab was open, so the file it asked for is no longer there.
      <button class="underline underline-offset-2" on:click={() => location.reload()}>Reload</button>
      to get the current version.
    </p>
  </div>
{/await}
