<script>
  import { onMount } from 'svelte';
  import NotifyToggle from '../lib/NotifyToggle.svelte';
  import { getRso } from '../api/rsos.js';
  import { getEvents } from '../api/events.js';
  import { navigate } from '../lib/router.js';
  import { pageTitle } from '../stores/ui.js';
  import { resolvedTheme } from '../stores/theme.js';
  import { organizationColor } from '../lib/organizationColor.js';
  import { DayGroup, EventRow, EmptyState } from '../lib/components/ui/index.js';
  import { groupByDay } from '../lib/agenda.js';

  /**
   * One student organization, and what it has been running.
   *
   * VIA had no page for an organization at all. A student who had heard of a
   * club and wanted to know what it actually does had to scroll the feed and
   * recognise the name on a row, and a search engine looking for somewhere to
   * point an event's organizer at found nothing to point at. This is that
   * page, and it is also a second route into every event page: until now the
   * front page was the only one, and a site with one way into each of its
   * pages is one Google discovers and then declines to crawl.
   *
   * What is on it is what a person deciding whether to follow an organization
   * reads for: what the organization says it is, what is coming up, and
   * whether anything has been happening lately.
   */
  let { id } = $props();

  let rso = $state(null);
  let upcoming = $state([]);
  let past = $state([]);
  let loading = $state(true);
  let missing = $state(false);

  const theme = $derived($resolvedTheme);
  const accent = $derived(organizationColor(rso?.logo_color, 'mark', theme));
  const now = new Date();

  const upcomingDays = $derived(groupByDay(upcoming));
  const pastDays = $derived(groupByDay(past));

  $effect(() => {
    pageTitle.set(rso?.rso_name ?? rso?.name ?? null);
    return () => pageTitle.set(null);
  });

  onMount(async () => {
    try {
      const { rso: loaded } = await getRso(id);
      if (!loaded) throw new Error('no such organization');
      rso = loaded;
    } catch {
      missing = true;
      loading = false;
      return;
    }

    /*
     * Both sides of today, asked for separately, because the feed answers one
     * window at a time and this page shows two. Internal events are left out
     * explicitly: this page is read by people who are not on the board.
     */
    const [next, before] = await Promise.all([
      getEvents({ rsoIds: [id], timeframe: 'upcoming', excludePrivate: true, limit: 50 })
        .catch(() => ({ events: [] })),
      getEvents({ rsoIds: [id], timeframe: 'archived', excludePrivate: true, limit: 12 })
        .catch(() => ({ events: [] })),
    ]);
    upcoming = next.events ?? [];
    past = before.events ?? [];
    loading = false;
  });

  const named = $derived(rso?.rso_name ?? rso?.name ?? '');
  const withColour = event => ({ ...event, rso_color: rso?.logo_color });
</script>

<svelte:head>
  <title>{named ? `${named}: events at Illinois` : 'Student organization'}: VIA</title>
</svelte:head>

<article class="organization">
  {#if missing}
    <h1>No organization here</h1>
    <p class="say">
      VIA has no organization at this address. It may have been removed, or the
      link may have been mistyped.
    </p>
    <p><a href="/organizations">Every ECE student organization</a></p>
  {:else if loading && !rso}
    <div class="bone" aria-hidden="true"></div>
  {:else}
    <header class="head">
      <span class="mark" style="--h: {accent}" aria-hidden="true"></span>
      <h1>{named}</h1>
      {#if rso?.description}<p class="about">{rso.description}</p>{/if}
      <p class="facts">
        <span>An Electrical and Computer Engineering student organization at Illinois.</span>
        {#if rso?.founded_year}<span class="mono">Founded in {rso.founded_year}.</span>{/if}
      </p>
      <!--
        Somebody decides they care about an organization while they are reading
        about it, which is here rather than in a settings screen somewhere else.
      -->
      <p class="follow">
        <NotifyToggle kind="organization" id={rso?.rso_id} name={named} />
      </p>
    </header>

    <section>
      <h2>Coming up</h2>
      {#if upcomingDays.length === 0}
        <EmptyState
          lead="Nothing on."
          say="{named} has nothing coming up on VIA just now. What it runs next will appear here."
        />
      {:else}
        {#each upcomingDays as group (group.day)}
          <DayGroup day={group.events[0].start_time} {now}>
            {#each group.events as event (event.event_id)}
              <EventRow event={withColour(event)} {theme} onnavigate={navigate} />
            {/each}
          </DayGroup>
        {/each}
      {/if}
    </section>

    {#if pastDays.length > 0}
      <section>
        <h2>Recently</h2>
        {#each pastDays as group (group.day)}
          <DayGroup day={group.events[0].start_time} {now}>
            {#each group.events as event (event.event_id)}
              <EventRow event={withColour(event)} {theme} onnavigate={navigate} />
            {/each}
          </DayGroup>
        {/each}
      </section>
    {/if}

    <p class="onwards">
      <a href="/organizations">Every ECE student organization</a>
    </p>
  {/if}
</article>

<style>
  .organization {
    display: grid;
    gap: 34px;
    align-content: start;
    max-width: 920px;
  }

  .head {
    display: grid;
    gap: 10px;
    justify-items: start;
  }

  /* The organization's own colour, as the pad the rest of the site uses. */
  .mark {
    width: 12px;
    height: 12px;
    border-radius: 2.5px;
    transform: rotate(45deg) scale(.85);
    background: var(--h, var(--primary));
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

  h2 {
    font-family: var(--display);
    font-stretch: 75%;
    font-variation-settings: "opsz" 96;
    font-weight: 800;
    font-size: 26px;
    color: var(--ink);
    margin: 0 0 14px;
  }

  .about {
    margin: 0;
    font-size: 16px;
    color: var(--ink-2);
    max-width: 62ch;
  }

  .facts {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    font-size: 13.5px;
    color: var(--muted);
  }

  .say {
    margin: 0;
    color: var(--ink-2);
    max-width: 58ch;
  }

  .onwards {
    margin: 0;
    font-size: 14.5px;
  }

  .onwards a,
  .say + p a {
    color: var(--primary);
  }

  /* What stands where the page will be until the organization has arrived. */
  .bone {
    height: 220px;
    background: var(--well);
  }

  @media (max-width: 640px) {
    h1 { font-size: 36px; }
  }
</style>
