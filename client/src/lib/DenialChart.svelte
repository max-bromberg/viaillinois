<script>
  import { tagHue } from './tagHue.js';
  import { EmptyState } from './components/ui/index.js';

  /**
   * Who was turned away, and why.
   *
   * The counts were printed in a plain column, which reads as a list of numbers
   * rather than as a shape, and the reason a reader is looking at this page is
   * to see which refusal is the big one. Each count is drawn as a bar as well
   * as printed, scaled against the busiest reason in the window, in the hue the
   * rest of the site would give that name. The hues are the eight in
   * docs/design/04-color.md and no colour is mixed here.
   */
  let {
    /** @type {Array<{ day: string, reason: string, denials: number, clients: number }>} */
    series = [],
  } = $props();

  // The busiest reason first, because that is the one worth acting on.
  const ordered = $derived([...series].sort((a, b) => b.denials - a.denials));

  const busiest = $derived(Math.max(1, ...ordered.map(row => row.denials)));

  const EXPLANATION = {
    overloaded: 'The server was too busy to answer.',
    rate_limited: 'The caller asked too many times in a short window.',
    row_budget: 'The caller was served more rows than an ordinary reader needs.',
    pool_exhausted: 'The database connection queue was full.',
    pagination_refused: 'The caller asked for a page too far into the results.',
    internal_unauthorized: 'Something other than the Discord bot tried the internal service API.',
  };
</script>

{#if ordered.length === 0}
  <EmptyState
    lead="Nobody was turned away."
    say="That is the reading you want. A refusal appears here within a minute of the server making it."
  />
{:else}
  <table>
    <thead>
      <tr>
        <th scope="col">Day</th>
        <th scope="col">Reason</th>
        <th scope="col">Refusals</th>
        <th scope="col">Clients</th>
        <th scope="col">What it means</th>
      </tr>
    </thead>
    <tbody>
      {#each ordered as row (`${row.day}-${row.reason}`)}
        <tr>
          <td class="mono">{row.day}</td>
          <td class="reason">{row.reason}</td>
          <td class="count">
            <span
              class="bar"
              style="--h: {tagHue(row.reason)}; --part: {Math.round((row.denials / busiest) * 100)}%"
              aria-hidden="true"
            ></span>
            <span class="mono">{row.denials}</span>
          </td>
          <td class="mono">{row.clients}</td>
          <td class="means">{EXPLANATION[row.reason] || ''}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    text-align: left;
    font-family: var(--display);
    font-stretch: 80%;
    font-variation-settings: "opsz" 96;
    font-weight: 700;
    font-size: 13px;
    color: var(--muted);
    padding: 0 14px 8px 0;
    border-bottom: 1px solid var(--line);
  }

  td {
    padding: 12px 14px 12px 0;
    border-top: 1px solid var(--line);
    font-size: 13.5px;
    color: var(--ink-2);
    vertical-align: baseline;
  }

  td.mono {
    font-size: 12.5px;
    color: var(--ink);
  }

  .reason {
    font-family: var(--display);
    font-stretch: 90%;
    font-variation-settings: "opsz" 96;
    font-weight: 700;
    font-size: 15px;
    color: var(--ink);
  }

  /*
   * The count is drawn and printed: the bar carries the size at a glance and
   * the numeral carries the exact figure, so nothing rides on the colour.
   */
  .count {
    min-width: 120px;
  }

  .count .mono {
    font-size: 13.5px;
    color: var(--ink);
  }

  .bar {
    display: block;
    height: 6px;
    width: var(--part);
    min-width: 2px;
    background: var(--h);
    margin-bottom: 6px;
  }

  .means {
    color: var(--muted);
  }
</style>
