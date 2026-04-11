<script>
  import NavBarSkeleton from './NavBarSkeleton.svelte';
  import EventCardSkeleton from './EventCardSkeleton.svelte';
</script>

<NavBarSkeleton />

<div class="min-h-screen bg-background text-foreground">
  <main class="container mx-auto px-4 py-6">
    <div class="flex gap-6">
      <!-- TagFilter sidebar placeholder (w-56 shrink-0 matches TagFilter's aside) -->
      <aside class="w-56 shrink-0 space-y-4">
        <div class="space-y-1">
          <div class="shimmer h-3 w-24"></div>
          <div class="shimmer h-8 w-full rounded"></div>
        </div>
        <div class="space-y-2">
          <div class="shimmer h-3 w-16"></div>
          <div class="flex flex-wrap gap-1">
            {#each Array(8) as _}
              <div class="shimmer h-5 w-20 rounded-full"></div>
            {/each}
          </div>
        </div>
        <div class="space-y-1">
          <div class="shimmer h-3 w-20"></div>
          <div class="shimmer h-8 w-full rounded"></div>
          <div class="shimmer h-8 w-full rounded"></div>
        </div>
      </aside>

      <!-- Main content area -->
      <div class="flex-1 space-y-4">
        <!-- "Upcoming Events" heading placeholder -->
        <div class="shimmer h-7 w-44"></div>

        <!-- Event card grid (matches Home's grid classes) -->
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {#each Array(6) as _}
            <EventCardSkeleton />
          {/each}
        </div>
      </div>
    </div>
  </main>
</div>
