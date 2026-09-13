<script>
  import { allUpdates } from './updates.js';
  import { navigate } from './router.js';
  import { campusDate } from './campusTime.js';
  import { Button } from './components/ui/index.js';

  /**
   * The three newest updates, beside the calendar.
   *
   * It was a bordered card with a caption in uppercase over it. The caption is
   * a heading now, in the rail heading role, and the card is gone: the rail has
   * no panel, and the rows are told apart by hairlines.
   *
   * See docs/design/08-surfaces.md.
   */
  const LIMIT = 3;

  const posts = $derived(allUpdates.slice(0, LIMIT));

  /**
   * The day an update was published, on the campus clock. A plain date read as
   * an instant is midnight in UTC, which is the evening before on campus.
   */
  const dayOf = date =>
    campusDate(`${date}T00:00`, { month: 'short', day: 'numeric', year: 'numeric' });

  function open(event, href) {
    event.preventDefault();
    navigate(href);
  }
</script>

{#if posts.length > 0}
  <section class="updates">
    <h2>Updates</h2>

    <div class="rows">
      {#each posts as post (post.slug)}
        <a href="/updates/{post.slug}" onclick={event => open(event, `/updates/${post.slug}`)}>
          <span class="title">{post.title}</span>
          <time class="mono" datetime={post.date}>{dayOf(post.date)}</time>
          {#if post.summary}<span class="say">{post.summary}</span>{/if}
        </a>
      {/each}
    </div>

    <Button variant="quiet" size="sm" href="/about/updates" icon="arrow" onclick={event => open(event, '/about/updates')}>
      All updates
    </Button>
  </section>
{/if}

<style>
  .updates {
    display: grid;
    gap: 12px;
    justify-items: start;
  }

  /* The rail heading role: condensed 800 at 16 px. */
  h2 {
    font-family: var(--display);
    font-stretch: 75%;
    font-variation-settings: "opsz" 96;
    font-weight: 800;
    font-size: 16px;
    line-height: 1.2;
    color: var(--ink);
    margin: 0;
  }

  .rows {
    display: grid;
    width: 100%;
  }

  .rows a {
    display: grid;
    gap: 4px;
    padding: 12px 0;
    border-top: 1px solid var(--line);
    text-decoration: none;
    color: inherit;
  }

  .rows a:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  .title {
    font-family: var(--display);
    font-stretch: 90%;
    font-variation-settings: "opsz" 96;
    font-weight: 700;
    font-size: 15.5px;
    line-height: 1.15;
    color: var(--ink);
  }

  .rows a:hover .title {
    color: var(--primary);
  }

  time {
    font-size: 12px;
    color: var(--muted);
  }

  .say {
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--muted);
  }
</style>
