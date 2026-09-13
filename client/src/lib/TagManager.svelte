<script>
  import { onMount } from 'svelte';
  import { getTags, createTag, deleteTag } from '../api/tags.js';
  import { showToast } from '../stores/ui.js';
  import { Button, Field, Highlight } from './components/ui/index.js';
  import { tagHue } from './tagHue.js';

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

<section class="tagging">
  <h2>Event tags</h2>
  <p class="about">
    These are the tags a board can put on an event, and the ones a student can filter the
    events feed by. Removing a tag also takes it off every event that carries it, so the
    count beside each one is worth reading first.
  </p>

  <form class="adding" on:submit|preventDefault={add}>
    <Field
      label="A new tag"
      id="new-tag"
      bind:value={newTag}
      placeholder="New tag, such as Hackathon"
      maxlength="50"
    />
    <Button type="submit" variant="primary" disabled={adding}>Add tag</Button>
  </form>

  {#if loading && tags.length === 0}
    <p class="quiet">Reading the tag list.</p>
  {:else if tags.length === 0}
    <p class="quiet">There are no tags yet.</p>
  {:else}
    <ul class="listing">
      {#each tags as tag (tag.tag_name)}
        <li class="row">
          <span class="what">
            <Highlight tone={tagHue(tag.tag_name)}>{tag.tag_name}</Highlight>
            <span class="count">{carried(tag.events)}</span>
          </span>
          <span class="doing">
            {#if confirming === tag.tag_name}
              <span class="sure">{carried(tag.events)} will lose this tag.</span>
              <Button variant="danger" size="sm" onclick={() => remove(tag.tag_name)}>Yes, remove it</Button>
              <Button variant="quiet" size="sm" onclick={() => confirming = null}>Keep it</Button>
            {:else}
              <Button variant="secondary" size="sm" onclick={() => confirming = tag.tag_name}>
                Remove {tag.tag_name}
              </Button>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .tagging {
    display: grid;
    gap: 16px;
    align-content: start;
    justify-items: start;
  }

  h2 {
    font-family: var(--display);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 22px;
    line-height: 1.1;
    margin: 0;
  }

  .about {
    margin: 0;
    font-size: 14px;
    color: var(--muted);
    max-width: 66ch;
  }

  .quiet {
    margin: 0;
    font-size: 14px;
    color: var(--muted);
  }

  .adding {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 16px 22px;
  }

  /* The tags are a listing on hairlines, not a boxed list with dividers. */
  .listing {
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
    display: grid;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 18px;
    padding: 10px 0;
    border-top: 1px solid var(--line);
  }

  .what {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 16px;
    font-size: 14.5px;
  }

  .count {
    font-family: var(--mono);
    font-size: 12.5px;
    color: var(--muted);
  }

  .doing {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }

  .sure {
    font-size: 12.5px;
    color: var(--danger);
  }
</style>
