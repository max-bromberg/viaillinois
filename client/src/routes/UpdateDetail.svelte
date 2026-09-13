<script>
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { getUpdate } from '../lib/updates.js';
  import { navigate } from '../lib/router.js';
  import { campusDate } from '../lib/campusTime.js';
  import ReadingPage from '../lib/ReadingPage.svelte';
  import { Button } from '../lib/components/ui/index.js';

  /**
   * One update, as a page of its own.
   *
   * A reading page: the title, the day it was published, and the prose, with
   * the body's own headings and lists taking the reading page's roles. The
   * markdown is sanitized before it is drawn, because it is written as a file
   * in the repository and rendered as markup here.
   */
  let { slug = '' } = $props();

  const update = $derived(getUpdate(slug));

  const html = $derived(update ? DOMPurify.sanitize(marked.parse(update.body)) : '');

  /**
   * The day an update was published, on the campus clock. A plain date read as
   * an instant is midnight in UTC, which is the evening before on campus, so
   * the day is named as a campus wall clock reading.
   */
  const published = $derived(
    update?.date
      ? campusDate(`${update.date}T00:00`, { month: 'short', day: 'numeric', year: 'numeric' })
      : null,
  );

  function back(event) {
    event.preventDefault();
    navigate('/updates');
  }
</script>

<svelte:head>
  {#if update}
    <title>{update.title}: VIA Updates</title>
    <meta name="description" content={update.summary} />
  {:else}
    <title>Not Found: VIA Updates</title>
  {/if}
</svelte:head>

{#if !update}
  <ReadingPage title="There is no update at this address">
    <p>
      The update that was here has been renamed or taken down. The whole listing is a page
      away, and the one you were looking for may well be on it.
    </p>
    <p class="back">
      <Button variant="quiet" href="/updates" icon="back" onclick={back}>All updates</Button>
    </p>
  </ReadingPage>
{:else}
  <ReadingPage title={update.title} dateline={published}>
    <p class="back">
      <Button variant="quiet" href="/updates" icon="back" onclick={back}>All updates</Button>
    </p>
    {@html html}
  </ReadingPage>
{/if}

<style>
  /*
   * The way back sits above the prose and takes none of the reading measure's
   * spacing, because it is a control rather than a sentence.
   */
  .back {
    margin-top: 18px;
  }
</style>
