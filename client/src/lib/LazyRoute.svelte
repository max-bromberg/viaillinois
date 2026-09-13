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
  <!--
    An error is a sentence under the thing that failed, never a red box.
  -->
  <div class="gone">
    <p class="said">This page could not be loaded.</p>
    <p class="why">
      VIA was updated while this tab was open, so the file it asked for is no longer there.
      <button type="button" on:click={() => location.reload()}>Reload</button>
      to get the current version.
    </p>
  </div>
{/await}

<style>
  .gone {
    padding: 26px 0;
    max-width: 58ch;
  }

  .said {
    font-family: var(--display);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 30px;
    line-height: 1;
    color: var(--danger);
  }

  .why {
    color: var(--ink-2);
    font-size: 14px;
    margin-top: 10px;
  }

  .why button {
    font: inherit;
    background: none;
    border: 0;
    padding: 0;
    color: var(--primary);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .why button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }
</style>
