<script>
  import { onMount } from 'svelte';
  import { getTags, createTag, deleteTag } from '../api/tags.js';
  import { showToast } from '../stores/ui.js';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';

  /**
   * The tags an event may carry.
   *
   * The eight the platform shipped with were written into the event form and
   * into the events feed's filter panel, in two copies of the same array, so
   * adding one meant a release. The list is kept here now.
   *
   * Removing a tag takes it off every event that carries it, because Event_Tags
   * points at the tag list and cascades. That is what removing a tag means, and
   * it is why the count is shown and why the removal is confirmed.
   */
  let tags = [];
  let loading = false;
  let newTag = '';
  let adding = false;
  /** The tag whose removal has been asked for but not yet confirmed. */
  let confirming = null;

  async function load() {
    loading = true;
    try {
      const { tags: rows } = await getTags();
      tags = rows ?? [];
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      loading = false;
    }
  }

  async function add() {
    const name = newTag.trim();
    if (!name || adding) return;
    adding = true;
    try {
      await createTag(name);
      newTag = '';
      showToast(`Added the tag ${name}.`);
      await load();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      adding = false;
    }
  }

  async function remove(tagName) {
    confirming = null;
    try {
      await deleteTag(tagName);
      showToast(`Removed the tag ${tagName}.`);
      await load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  const carried = events =>
    events === 0 ? 'no events' : `${events} ${events === 1 ? 'event' : 'events'}`;

  onMount(load);
</script>

<div class="space-y-4">
  <section class="border rounded-lg p-5 bg-card shadow-sm space-y-4">
    <div>
      <h2 class="text-base font-semibold">Event tags</h2>
      <p class="text-sm text-muted-foreground">
        These are the tags a board can put on an event, and the ones a student can filter
        the events feed by. Removing a tag also takes it off every event that carries it,
        so the count beside each one is worth reading first.
      </p>
    </div>

    <form class="flex gap-2 flex-wrap" on:submit|preventDefault={add}>
      <Input
        bind:value={newTag}
        placeholder="New tag, such as Hackathon"
        maxlength="50"
        class="w-64"
      />
      <Button type="submit" disabled={adding}>Add tag</Button>
    </form>

    {#if loading && tags.length === 0}
      <p class="text-sm text-muted-foreground">Loading the tag list.</p>
    {:else if tags.length === 0}
      <p class="text-sm text-muted-foreground">There are no tags yet.</p>
    {:else}
      <ul class="border rounded-md divide-y">
        {#each tags as tag (tag.tag_name)}
          <li class="flex items-center justify-between gap-4 px-3 py-2">
            <span class="text-sm font-medium">{tag.tag_name}</span>
            <div class="flex items-center gap-3">
              <span class="text-xs text-muted-foreground">{carried(tag.events)}</span>
              {#if confirming === tag.tag_name}
                <span class="text-xs text-destructive">
                  {carried(tag.events)} will lose this tag.
                </span>
                <button
                  class="px-2.5 py-1 text-xs bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors"
                  on:click={() => remove(tag.tag_name)}
                >Yes, remove it</button>
                <button
                  class="px-2.5 py-1 text-xs border border-input rounded-md hover:bg-accent transition-colors"
                  on:click={() => confirming = null}
                >Cancel</button>
              {:else}
                <button
                  class="px-2.5 py-1 text-xs border border-destructive/50 text-destructive rounded-md hover:bg-destructive/10 transition-colors"
                  on:click={() => confirming = tag.tag_name}
                >Remove {tag.tag_name}</button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
