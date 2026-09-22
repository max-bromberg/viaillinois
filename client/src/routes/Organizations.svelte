<script>
  import { onMount } from 'svelte';
  import { getRsos } from '../api/rsos.js';
  import { pageTitle } from '../stores/ui.js';
  import { resolvedTheme } from '../stores/theme.js';
  import { organizationColor } from '../lib/organizationColor.js';
  import { EmptyState } from '../lib/components/ui/index.js';

  /**
   * Every student organization publishing on VIA.
   *
   * A student who has heard a club's name and wants to know what it does had
   * nowhere to look: the feed shows events, and the name on a row is as far as
   * it went. This is also the page that makes the rest of the site reachable.
   * A crawler that reads one page and follows its links can get from here to
   * every organization and from there to every event, where before the front
   * page was the only route into any of it.
   */
  let rsos = $state([]);
  let loading = $state(true);
  let failed = $state(false);

  const theme = $derived($resolvedTheme);

  $effect(() => {
    pageTitle.set('Student organizations');
    return () => pageTitle.set(null);
  });

  onMount(async () => {
    try {
      const { rsos: loaded } = await getRsos();
      rsos = (loaded ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>ECE student organizations at Illinois: VIA</title>
</svelte:head>

<div class="organizations">
  <header class="head">
    <h1>ECE student organizations</h1>
    <p class="about">
      Every Electrical and Computer Engineering student organization at Illinois
      that publishes its events on VIA. Each one has a page saying what it is
      and what it has coming up.
    </p>
  </header>

  {#if loading}
    <div class="bones" aria-hidden="true">
      {#each Array(6) as _, index (index)}<div class="bone"></div>{/each}
    </div>
  {:else if failed}
    <EmptyState
      lead="Nothing to show."
      say="The organizations could not be loaded just now. Please try again in a moment."
    />
  {:else if rsos.length === 0}
    <EmptyState
      lead="Nothing here yet."
      say="No organization has published anything on VIA yet."
    />
  {:else}
    <ul class="list">
      {#each rsos as rso (rso.rso_id)}
        <li>
          <a class="card" href="/organizations/{rso.rso_id}">
            <span
              class="mark"
              style="--h: {organizationColor(rso.logo_color, 'mark', theme)}"
              aria-hidden="true"
            ></span>
            <span class="named">{rso.name}</span>
            {#if rso.description}<span class="about">{rso.description}</span>{/if}
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .organizations {
    display: grid;
    gap: 28px;
    align-content: start;
  }

  .head {
    display: grid;
    gap: 8px;
    justify-items: start;
  }

  h1 {
    font-family: var(--display);
    font-stretch: 75%;
    font-variation-settings: "opsz" 96;
    font-weight: 800;
    font-size: 48px;
    line-height: 1;
    letter-spacing: .006em;
    color: var(--ink);
    margin: 0;
  }

  .head .about {
    margin: 0;
    color: var(--muted);
    font-size: 14.5px;
    max-width: 62ch;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
  }

  /* A card carries the chamfer every surface on the site does. */
  .card {
    display: grid;
    gap: 8px;
    padding: 18px 20px;
    background: var(--card);
    color: var(--ink);
    text-decoration: none;
    box-shadow: inset 0 0 0 1px var(--line);
    --cut: 14px;
    clip-path: polygon(0 0, calc(100% - var(--cut)) 0, 100% var(--cut), 100% 100%, 0 100%);
    height: 100%;
    align-content: start;
  }

  .card:hover {
    box-shadow: inset 0 0 0 1.5px var(--line-strong);
  }

  .card:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 3px;
  }

  .mark {
    width: 12px;
    height: 12px;
    border-radius: 2.5px;
    transform: rotate(45deg) scale(.85);
    background: var(--h, var(--primary));
  }

  .named {
    font-family: var(--display);
    font-stretch: 85%;
    font-weight: 800;
    font-size: 20px;
    line-height: 1.15;
  }

  .card .about {
    font-size: 13.5px;
    color: var(--ink-2);
    line-height: 1.5;
  }

  .bones {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
  }

  .bone {
    height: 116px;
    background: var(--well);
  }

  @media (max-width: 640px) {
    h1 { font-size: 36px; }
  }
</style>
