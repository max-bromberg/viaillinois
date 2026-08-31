<script>
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { getUpdate, formatDate } from '../lib/updates.js';
  import { navigate } from '../lib/router.js';

  export let slug = '';

  $: update = getUpdate(slug);
  $: htmlPromise = update ? Promise.resolve(DOMPurify.sanitize(marked.parse(update.body))) : Promise.resolve('');
</script>

<svelte:head>
  {#if update}
    <title>{update.title}: VIA Updates</title>
    <meta name="description" content={update.summary} />
  {:else}
    <title>Not Found: VIA Updates</title>
  {/if}
</svelte:head>

<div class="max-w-2xl mx-auto">
  <a
    href="/updates"
    on:click|preventDefault={() => navigate('/updates')}
    class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
    All updates
  </a>

  {#if !update}
    <p class="text-muted-foreground">Update not found.</p>
  {:else}
    <article class="rounded-lg border bg-card p-6 sm:p-8">
      <h1 class="text-2xl font-bold mb-1">{update.title}</h1>
      <time class="text-sm text-muted-foreground">{formatDate(update.date)}</time>

      {#await htmlPromise then html}
        <div class="update-body mt-6 text-sm leading-relaxed space-y-4">
          {@html html}
        </div>
      {/await}
    </article>
  {/if}
</div>

<style>
  .update-body :global(h1),
  .update-body :global(h2),
  .update-body :global(h3) {
    font-weight: 600;
    margin-top: 1.5rem;
    margin-bottom: 0.5rem;
  }
  .update-body :global(h1) { font-size: 1.25rem; }
  .update-body :global(h2) { font-size: 1.1rem; }
  .update-body :global(h3) { font-size: 1rem; }
  .update-body :global(p)  { margin-bottom: 0.75rem; }
  .update-body :global(ul),
  .update-body :global(ol) { padding-left: 1.5rem; margin-bottom: 0.75rem; }
  .update-body :global(li) { margin-bottom: 0.25rem; }
  .update-body :global(ul) { list-style-type: disc; }
  .update-body :global(ol) { list-style-type: decimal; }
  .update-body :global(strong) { font-weight: 600; }
  .update-body :global(em)     { font-style: italic; }
  .update-body :global(a) {
    text-decoration: underline;
    text-underline-offset: 2px;
    color: hsl(var(--primary));
  }
  .update-body :global(code) {
    font-family: monospace;
    font-size: 0.85em;
    background: hsl(var(--muted));
    padding: 0.1em 0.3em;
    border-radius: 3px;
  }
  .update-body :global(blockquote) {
    border-left: 3px solid hsl(var(--border));
    padding-left: 1rem;
    color: hsl(var(--muted-foreground));
    margin: 0.75rem 0;
  }
  .update-body :global(hr) {
    border: none;
    border-top: 1px solid hsl(var(--border));
    margin: 1.5rem 0;
  }
</style>
