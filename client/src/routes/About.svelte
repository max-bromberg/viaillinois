<script>
  import { allUpdates, formatDate } from '../lib/updates.js';
  import { currentPath, navigate, routeParams } from '../lib/router.js';
  import BugReportForm from '../lib/BugReportForm.svelte';

  /**
   * About holds more than one thing.
   *
   * Updates had an entry of their own in the navigation, beside About, which
   * put two entries there for one thing a reader looks at rarely. Each tab has
   * an address of its own so that a reader can be linked straight to it, and
   * the pages the updates have always had at /updates are untouched.
   */
  const TABS = [
    { slug: '',        label: 'About VIA' },
    { slug: 'updates', label: 'Updates' },
    { slug: 'report',  label: 'Report a bug' },
  ];

  $: tab = $currentPath === '/about' ? '' : ($routeParams.tab ?? '');

  function open(slug) {
    navigate(slug === '' ? '/about' : `/about/${slug}`);
  }
</script>

<svelte:head>
  <title>{tab === 'updates' ? 'Updates: VIA' : tab === 'report' ? 'Report a bug: VIA' : 'About: VIA'}</title>
  <meta name="description" content="VIA is the centralized event platform for UIUC ECE student organizations, one place to discover events, coordinate scheduling, and stay on top of midterms." />
</svelte:head>

<div class="max-w-2xl mx-auto space-y-6">

  <div class="flex gap-1 border-b" role="tablist">
    {#each TABS as entry}
      <button
        role="tab"
        aria-selected={tab === entry.slug}
        class="px-4 py-2 text-sm font-medium transition-colors
          {tab === entry.slug ? 'border-b-2 border-primary text-primary -mb-px' : 'text-muted-foreground hover:text-foreground'}"
        on:click={() => open(entry.slug)}
      >{entry.label}</button>
    {/each}
  </div>

  {#if tab === 'report'}
    <BugReportForm />
  {:else if tab === 'updates'}
    <div class="space-y-4">
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
  {:else}

  <!-- Hero -->
  <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3">
    <h1 class="text-3xl font-bold tracking-tight">About VIA</h1>
    <p class="text-muted-foreground text-lg leading-relaxed">
      <strong class="text-foreground">Virtually Integrated Agenda</strong> is the shared event hub
      for UIUC ECE student organizations, one place to discover what's happening and
      coordinate your schedule.
    </p>
  </div>

  <!-- The problem / why -->
  <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3">
    <h2 class="text-xl font-semibold">Why VIA?</h2>
    <p class="text-sm text-muted-foreground leading-relaxed">
      UIUC's ECE department is home to many active student organizations, each running
      their own events across scattered channels: mailing lists, Discord servers, physical
      flyers. Students miss events they'd love, and RSO leaders burn time duplicating
      announcements everywhere.
    </p>
    <p class="text-sm text-muted-foreground leading-relaxed">
      VIA gives every ECE RSO a shared public calendar and a private coordination layer,
      so members always know what's on, and board members can plan without the noise.
    </p>
  </div>

  <!-- For students -->
  <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-4">
    <h2 class="text-xl font-semibold">For ECE students</h2>
    <div class="grid sm:grid-cols-2 gap-4">
      <div class="border rounded-lg p-4 bg-card space-y-1.5">
        <h3 class="font-medium text-sm">Event Feed</h3>
        <p class="text-xs text-muted-foreground leading-relaxed">
          Browse all upcoming ECE RSO events in one scrollable feed. Filter by tag,
          keyword, or date to find exactly what you're looking for.
        </p>
      </div>
      <div class="border rounded-lg p-4 bg-card space-y-1.5">
        <h3 class="font-medium text-sm">Calendar View</h3>
        <p class="text-xs text-muted-foreground leading-relaxed">
          See the full month at a glance. Spot conflicts, plan ahead, and never
          double-book yourself during crunch time.
        </p>
      </div>
      <div class="border rounded-lg p-4 bg-card space-y-1.5">
        <h3 class="font-medium text-sm">Midterm Tracker</h3>
        <p class="text-xs text-muted-foreground leading-relaxed">
          Community-sourced exam dates for ECE courses, all in one table. Know
          which weeks are brutal before you commit to an evening.
        </p>
      </div>
      <div class="border rounded-lg p-4 bg-card space-y-1.5">
        <h3 class="font-medium text-sm">Discovery</h3>
        <p class="text-xs text-muted-foreground leading-relaxed">
          Come for one organization's events and find the ones you had never
          heard of, hosting something on the same evening.
        </p>
      </div>
    </div>
  </div>

  <!-- For RSOs -->
  <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-4">
    <h2 class="text-xl font-semibold">For RSO boards</h2>
    <div class="grid sm:grid-cols-2 gap-4">
      <div class="border rounded-lg p-4 bg-card space-y-1.5">
        <h3 class="font-medium text-sm">Event Management</h3>
        <p class="text-xs text-muted-foreground leading-relaxed">
          Create, edit, and delete events from a clean logistics dashboard.
          Set visibility, tags, location, and capacity in one place.
        </p>
      </div>
      <div class="border rounded-lg p-4 bg-card space-y-1.5">
        <h3 class="font-medium text-sm">Instant Reach</h3>
        <p class="text-xs text-muted-foreground leading-relaxed">
          Your events surface automatically to the entire ECE student body,
          no mailing lists to manage, no flyers to print.
        </p>
      </div>
      <div class="border rounded-lg p-4 bg-card space-y-1.5">
        <h3 class="font-medium text-sm">Cross-RSO Coordination</h3>
        <p class="text-xs text-muted-foreground leading-relaxed">
          Board members see all internal ECE events on the calendar, making it
          easy to avoid scheduling on top of other organizations' big nights.
        </p>
      </div>
      <div class="border rounded-lg p-4 bg-card space-y-1.5">
        <h3 class="font-medium text-sm">Venue Recommendations</h3>
        <p class="text-xs text-muted-foreground leading-relaxed">
          Get venue suggestions based on your event type, expected
          attendance, and past booking history.
        </p>
      </div>
    </div>
  </div>

  <!-- Origin note -->
  <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-2">
    <h2 class="text-xl font-semibold">Background</h2>
    <p class="text-sm text-muted-foreground leading-relaxed">
      VIA was built by a team of four Illinois ECE students who wanted to solve
      a real problem in their own community. It started as a CS 411 Database Systems
      course project and grew into a real platform.
    </p>
  </div>

  <!-- Contact -->
  <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-2">
    <h2 class="text-xl font-semibold">Contact</h2>
    <p class="text-sm text-muted-foreground leading-relaxed">
      Write to
      <a href="mailto:mzainab2@illinois.edu" class="underline underline-offset-2 hover:text-foreground transition-colors">mzainab2@illinois.edu</a>
      with anything about VIA: a problem with the site, a student organization that wants
      to be listed, a request about your own information, a copyright complaint, or a
      security issue you have found.
    </p>
    <p class="text-sm text-muted-foreground leading-relaxed">
      Requests about your information are described in the
      <a href="/privacy" class="underline underline-offset-2 hover:text-foreground transition-colors">Privacy Policy</a>,
      and the <a href="/terms" class="underline underline-offset-2 hover:text-foreground transition-colors">Terms of Use</a>
      set out what applies when you use the platform.
    </p>
  </div>

  {/if}

</div>
