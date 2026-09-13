<script>
  import { allUpdates } from '../lib/updates.js';
  import { currentPath, navigate, routeParams } from '../lib/router.js';
  import { campusDate } from '../lib/campusTime.js';
  import BugReportForm from '../lib/BugReportForm.svelte';
  import ReadingPage from '../lib/ReadingPage.svelte';
  import { EmptyState } from '../lib/components/ui/index.js';

  /**
   * About holds more than one thing.
   *
   * Updates had an entry of their own in the navigation, beside About, which
   * put two entries there for one thing a reader looks at rarely. Each tab has
   * an address of its own so that a reader can be linked straight to it, and
   * the pages the updates have always had at /updates are untouched.
   *
   * All three are reading pages. The three words at the top are the same
   * control the filter rail uses for Upcoming and Past: words, with the open
   * one underlined by the Current gradient, rather than a strip of tabs with a
   * border under them.
   */
  const TABS = [
    { slug: '',        label: 'About VIA' },
    { slug: 'updates', label: 'Updates' },
    { slug: 'report',  label: 'Report a bug' },
  ];

  const tab = $derived($currentPath === '/about' ? '' : ($routeParams.tab ?? ''));
  const title = $derived(TABS.find(entry => entry.slug === tab)?.label ?? 'About VIA');

  const headTitle = $derived(
    tab === 'updates' ? 'Updates: VIA' : tab === 'report' ? 'Report a bug: VIA' : 'About: VIA',
  );

  function open(slug) {
    navigate(slug === '' ? '/about' : `/about/${slug}`);
  }

  function read(event, href) {
    event.preventDefault();
    navigate(href);
  }

  /**
   * The day an update was published, on the campus clock. A plain date read as
   * an instant is midnight in UTC, which is the evening before on campus.
   */
  const dayOf = date =>
    campusDate(`${date}T00:00`, { month: 'short', day: 'numeric', year: 'numeric' });
</script>

<svelte:head>
  <title>{headTitle}</title>
  <meta name="description" content="VIA is where the student organizations of the Electrical and Computer Engineering department at Illinois keep what is on, in one place: the event feed, the calendar and the midterm schedule." />
</svelte:head>

<ReadingPage {title}>
  <div class="tabs" role="tablist">
    {#each TABS as entry (entry.slug)}
      <button
        role="tab"
        type="button"
        class="tab"
        class:open={tab === entry.slug}
        aria-selected={tab === entry.slug}
        onclick={() => open(entry.slug)}
      >{entry.label}</button>
    {/each}
  </div>

  {#if tab === 'report'}
    <BugReportForm />
  {:else if tab === 'updates'}
    <p>
      What has changed on the platform, newest first. Each one has a page of its own that
      you can link to.
    </p>

    {#if allUpdates.length === 0}
      <EmptyState
        lead="Nothing has landed yet."
        say="The first update goes up when the first piece of work ships. The About page says what the platform does in the meantime."
      />
    {:else}
      <div class="updates">
        {#each allUpdates as update (update.slug)}
          <a
            href="/updates/{update.slug}"
            onclick={event => read(event, `/updates/${update.slug}`)}
          >
            <h2>{update.title}</h2>
            <time class="mono" datetime={update.date}>{dayOf(update.date)}</time>
            {#if update.summary}<p class="say">{update.summary}</p>{/if}
          </a>
        {/each}
      </div>
    {/if}
  {:else}
    <p>
      VIA, which is short for Virtually Integrated Agenda, is where the student
      organizations of the Electrical and Computer Engineering department at the University
      of Illinois Urbana-Champaign keep what is on. One feed, one calendar, one exam
      schedule, and one place for a board to file an event.
    </p>

    <section>
      <h2>Why it exists</h2>
      <p>
        The department is home to a lot of active student organizations, and each of them
        announces its events somewhere different: a mailing list, a Discord server, a paper
        flyer by a lecture hall door. Students miss events they would have gone to, and
        board members spend their evenings posting the same announcement in five places.
      </p>
      <p>
        VIA gives every organization one public listing and one private place to coordinate,
        so that members know what is on and boards can plan without the noise.
      </p>
    </section>

    <section>
      <h2>For students</h2>
      <p>
        The event feed carries everything upcoming in one place, and you can narrow it by
        tag, by word or by date. The calendar lays the same events out across the month, so
        you can see what a week looks like before you promise an evening to anybody. The
        midterm schedule collects exam dates for the department's courses, kept by students
        and confirmed by course staff.
      </p>
      <p>
        Reading one organization's events is also how you find the ones you had never heard
        of, running something in the same building on the same night.
      </p>
    </section>

    <section>
      <h2>For boards</h2>
      <p>
        The logistics dashboard is where a board files an event, edits it, cancels it, and
        sets its visibility, its tags, its location and how many people it expects. What a
        board publishes reaches the whole department with no mailing list to keep and no
        flyer to print.
      </p>
      <p>
        Board members also see the events that are internal to their organizations on the
        calendar, which is what makes it possible to avoid scheduling on top of somebody
        else's big night. The scheduler suggests a venue from the kind of event, the number
        of people expected, and what has been booked before.
      </p>
    </section>

    <section>
      <h2>Where it came from</h2>
      <p>
        VIA was built by four Illinois students in the Electrical and Computer Engineering
        department who wanted to fix something in their own building. It started as a CS 411
        Database Systems course project. The course has ended and the platform has not: it is
        a volunteer project with real users now, run in public.
      </p>
    </section>

    <section>
      <h2>Contact</h2>
      <p>
        Write to
        <a href="mailto:mzainab2@illinois.edu">mzainab2@illinois.edu</a>
        with anything about VIA: a problem with the site, a student organization that wants
        to be listed, a request about your own information, a copyright complaint, or a
        security issue you have found.
      </p>
      <p>
        Requests about your information are described in the
        <a href="/privacy" onclick={event => read(event, '/privacy')}>Privacy Policy</a>,
        and the
        <a href="/terms" onclick={event => read(event, '/terms')}>Terms of Use</a>
        set out what applies when you use the platform.
      </p>
    </section>
  {/if}
</ReadingPage>

<style>
  /*
   * The three words, with the open one underlined by the Current gradient.
   * This is the control the filter rail uses for Upcoming and Past, which is
   * the site's way of saying that one of a few things is open.
   */
  .tabs {
    display: flex;
    gap: 22px;
    flex-wrap: wrap;
    margin-top: 20px;
  }

  .tab {
    font: inherit;
    font-family: var(--display);
    font-stretch: 75%;
    font-variation-settings: "opsz" 96;
    font-weight: 800;
    font-size: 16px;
    line-height: 1.2;
    background: none;
    border: 0;
    padding: 0 0 8px;
    min-height: 32px;
    color: var(--muted);
    cursor: pointer;
    position: relative;
  }

  .tab.open {
    color: var(--ink);
  }

  .tab.open::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: var(--g-current);
  }

  .tab:hover {
    color: var(--ink);
  }

  .tab:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  /* The listing: rows told apart by a hairline, with the date in mono. */
  .updates {
    margin-top: 26px;
    display: grid;
  }

  .updates a {
    display: grid;
    gap: 4px;
    padding: 18px 0;
    border-top: 1px solid var(--line);
    text-decoration: none;
    color: inherit;
  }

  .updates a:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  .updates h2 {
    font-family: var(--display);
    font-stretch: 90%;
    font-variation-settings: "opsz" 96;
    font-weight: 700;
    font-size: 19px;
    line-height: 1.15;
    letter-spacing: 0;
    color: var(--ink);
    margin: 0;
  }

  .updates a:hover h2 {
    color: var(--primary);
  }

  .updates time {
    font-size: 12px;
    color: var(--muted);
  }

  .updates .say {
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--muted);
    margin: 2px 0 0;
    max-width: 62ch;
  }
</style>
