<script>
  import { onMount } from 'svelte';
  import { navigate } from '../lib/router.js';

  /**
   * Where the updates listing used to be.
   *
   * The listing is a tab of About now. This address is linked to from outside
   * VIA and from anything anybody bookmarked, so it leads to where the listing
   * went rather than to nothing. Each update keeps its own page at
   * /updates/<slug>, which is what the listing and the sidebar widget link to.
   */
  onMount(() => navigate('/about/updates'));
</script>

<svelte:head>
  <title>Updates: VIA</title>
</svelte:head>

<p>Taking you to the updates.</p>

<style>
  p {
    font-family: var(--sans);
    font-size: 15px;
    line-height: 1.55;
    color: var(--ink-2);
    max-width: 62ch;
  }
</style>
