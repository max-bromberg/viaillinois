<script>
  /** @type {Array<{ day: string, reason: string, denials: number, clients: number }>} */
  export let series = [];

  // The busiest reason first, because that is the one worth acting on.
  $: ordered = [...series].sort((a, b) => b.denials - a.denials);

  const EXPLANATION = {
    overloaded: 'The server was too busy to answer.',
    rate_limited: 'The caller asked too many times in a short window.',
    row_budget: 'The caller was served more rows than an ordinary reader needs.',
    pool_exhausted: 'The database connection queue was full.',
    pagination_refused: 'The caller asked for a page too far into the results.',
  };
</script>

{#if ordered.length === 0}
  <p class="text-sm text-muted-foreground">
    Nobody was turned away in this window. That is the reading you want.
  </p>
{:else}
  <table class="w-full text-sm">
    <thead>
      <tr class="text-left text-muted-foreground border-b">
        <th class="py-2 font-medium">Day</th>
        <th class="py-2 font-medium">Reason</th>
        <th class="py-2 font-medium">Refusals</th>
        <th class="py-2 font-medium">Clients</th>
        <th class="py-2 font-medium">What it means</th>
      </tr>
    </thead>
    <tbody>
      {#each ordered as row}
        <tr class="border-b last:border-0">
          <td class="py-2">{row.day}</td>
          <td class="py-2 font-mono text-xs">{row.reason}</td>
          <td class="py-2">{row.denials}</td>
          <td class="py-2">{row.clients}</td>
          <td class="py-2 text-muted-foreground">{EXPLANATION[row.reason] || ''}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
