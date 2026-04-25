<script>
  import { allUpdates, formatDate } from './updates.js';
  import { navigate } from './router.js';

  const LIMIT = 3;
  $: posts = allUpdates.slice(0, LIMIT);
</script>

{#if posts.length > 0}
<div class="rounded-lg border bg-card p-4 space-y-3">
  <div class="flex items-center justify-between">
    <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform Updates</h3>
    <a
      href="/updates"
      on:click|preventDefault={() => navigate('/updates')}
      class="text-xs text-muted-foreground hover:text-foreground transition-colors"
    >View all →</a>
  </div>

  <div class="space-y-3">
    {#each posts as post (post.slug)}
      <a
        href="/updates/{post.slug}"
        on:click|preventDefault={() => navigate(`/updates/${post.slug}`)}
        class="block group space-y-0.5"
      >
        <p class="text-sm font-medium leading-snug group-hover:text-primary transition-colors">{post.title}</p>
        <p class="text-xs text-muted-foreground">{formatDate(post.date)}</p>
        {#if post.summary}
          <p class="text-xs text-muted-foreground line-clamp-2">{post.summary}</p>
        {/if}
      </a>
    {/each}
  </div>
</div>
{/if}
