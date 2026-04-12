<script>
  import { navigate } from './router.js';
</script>

<footer class="border-t bg-background/95 backdrop-blur mt-12">
  <div class="container mx-auto px-4 py-8">
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-8">

      <!-- Brand -->
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <img src="/via_logo_black.svg" alt="VIA" class="h-5 w-auto" />
          <span class="text-sm font-semibold">VIA</span>
        </div>
        <p class="text-xs text-muted-foreground leading-relaxed">
          Virtually Integrated Agenda — the event hub for UIUC ECE student organizations.
        </p>
      </div>

      <!-- Quick links -->
      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Explore</p>
        <nav class="flex flex-col gap-1.5">
          <a href="/"         on:click|preventDefault={() => navigate('/')}         class="text-sm text-muted-foreground hover:text-foreground transition-colors">Events</a>
          <a href="/calendar" on:click|preventDefault={() => navigate('/calendar')} class="text-sm text-muted-foreground hover:text-foreground transition-colors">Calendar</a>
          <a href="/midterms" on:click|preventDefault={() => navigate('/midterms')} class="text-sm text-muted-foreground hover:text-foreground transition-colors">Midterms</a>
          <a href="/about"    on:click|preventDefault={() => navigate('/about')}    class="text-sm text-muted-foreground hover:text-foreground transition-colors">About</a>
        </nav>
      </div>

      <!-- Attribution -->
      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Built at UIUC</p>
        <p class="text-xs text-muted-foreground leading-relaxed">
          A CS411 Database Systems project by Team001-TableForFour.<br />
          University of Illinois Urbana-Champaign, ECE Department.
        </p>
      </div>

    </div>

    <div class="border-t mt-8 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
      <p class="text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} VIA — Virtually Integrated Agenda
      </p>
      <p class="text-xs text-muted-foreground">
        Built for UIUC ECE &middot; CS411 Team001-TableForFour
      </p>
    </div>
  </div>
</footer>
