<svelte:head>
  <title>About – VIA</title>
  <meta name="description" content="Learn about VIA, the centralized event platform built for UIUC ECE student organizations by Team001-TableForFour." />
</svelte:head>

<div class="max-w-2xl mx-auto space-y-10">

  <!-- Hero -->
  <div class="space-y-3">
    <h1 class="text-3xl font-bold tracking-tight">About VIA</h1>
    <p class="text-muted-foreground text-lg leading-relaxed">
      Virtually Integrated Agenda is a centralized event platform for student
      organizations in the UIUC ECE department — one place to discover events,
      coordinate scheduling, and stay on top of midterms.
    </p>
  </div>

  <!-- The problem / why -->
  <div class="space-y-3">
    <h2 class="text-xl font-semibold">Why VIA?</h2>
    <p class="text-sm text-muted-foreground leading-relaxed">
      UIUC's ECE department is home to dozens of active student organizations,
      each running their own events on separate platforms — mailing lists,
      Discord servers, physical flyers. Students miss events they'd love to
      attend, and RSO leaders spend time duplicating logistics across channels.
    </p>
    <p class="text-sm text-muted-foreground leading-relaxed">
      VIA solves this by giving every ECE RSO a shared home for their public
      calendar, while keeping internal scheduling tools behind a login so
      board members can coordinate without noise.
    </p>
  </div>

  <!-- What VIA offers -->
  <div class="space-y-4">
    <h2 class="text-xl font-semibold">What's included</h2>
    <div class="grid sm:grid-cols-2 gap-4">
      <div class="border rounded-lg p-4 bg-card space-y-1.5">
        <h3 class="font-medium text-sm">Public Event Feed</h3>
        <p class="text-xs text-muted-foreground leading-relaxed">
          Browse and filter upcoming ECE RSO events by tag, keyword, or date.
          RSVP to events you're interested in.
        </p>
      </div>
      <div class="border rounded-lg p-4 bg-card space-y-1.5">
        <h3 class="font-medium text-sm">Calendar View</h3>
        <p class="text-xs text-muted-foreground leading-relaxed">
          See events laid out by month. Board and admin members also see
          internal events for cross-RSO scheduling.
        </p>
      </div>
      <div class="border rounded-lg p-4 bg-card space-y-1.5">
        <h3 class="font-medium text-sm">Midterm Tracker</h3>
        <p class="text-xs text-muted-foreground leading-relaxed">
          Community-sourced exam schedule for ECE courses. RSO boards use
          this to avoid scheduling conflicts during exam weeks.
        </p>
      </div>
      <div class="border rounded-lg p-4 bg-card space-y-1.5">
        <h3 class="font-medium text-sm">RSO Dashboard</h3>
        <p class="text-xs text-muted-foreground leading-relaxed">
          Create and manage events, configure RSO details, and manage
          membership — all from a single logistics dashboard.
        </p>
      </div>
    </div>
  </div>

  <!-- Team -->
  <div class="space-y-3">
    <h2 class="text-xl font-semibold">The team</h2>
    <p class="text-sm text-muted-foreground leading-relaxed">
      VIA was designed and built by <strong class="text-foreground">Team001-TableForFour</strong> as a
      CS411 (Database Systems) course project at the University of Illinois Urbana-Champaign.
      The project demonstrates applied database design — relational schema,
      advanced SQL queries, indexing analysis, transactions, stored procedures,
      and triggers — deployed as a production-quality web application.
    </p>
    <p class="text-sm text-muted-foreground">
      University of Illinois Urbana-Champaign &middot; Thomas M. Siebel Center for Computer Science
    </p>
  </div>

</div>
