<script>
  import { allUpdates, formatDate } from '../lib/updates.js';
  import { navigate } from '../lib/router.js';
</script>

<svelte:head>
  <title>Updates – VIA</title>
  <meta name="description" content="Platform updates, new features, and improvements to VIA." />
</svelte:head>

<div class="max-w-2xl mx-auto space-y-6">
  <h1 class="text-2xl font-bold">Platform Updates</h1>

  {#if allUpdates.length === 0}
    <p class="text-muted-foreground">No updates yet.</p>
  {:else}
    {#each allUpdates as update (update.slug)}
      <a
        href="/updates/{update.slug}"
        on:click|preventDefault={() => navigate(`/updates/${update.slug}`)}
        class="block group rounded-lg border bg-card p-5 hover:border-primary transition-colors"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h2 class="text-base font-semibold group-hover:text-primary transition-colors">{update.title}</h2>
          <time class="text-xs text-muted-foreground shrink-0">{formatDate(update.date)}</time>
        </div>
        {#if update.summary}
          <p class="text-sm text-muted-foreground">{update.summary}</p>
        {/if}
      </a>
    {/each}
  {/if}
</div>
