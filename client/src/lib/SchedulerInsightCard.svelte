<script>
  import { createEventDispatcher } from 'svelte';
  import { campusDateTime, campusTime } from './campusTime.js';
  import { Lamp, Numeral, Icon, Pad, Button, Highlight } from './components/ui/index.js';

  /**
   * One time the scheduler found.
   *
   * A recommendation is a row with the organization's light falling across it
   * from the top left and the score as a numeral, which is what
   * docs/design/08-surfaces.md asks the scheduler for. It was a card with a
   * coloured header, a percentage in a tinted tile and emoji in front of each
   * reason, and the emoji drew differently on every platform the site is read
   * on.
   */

  /** The recommendation: { start, end, location, score, insights }. */
  export let recommendation;
  /** Where it came in the curated list, counted from one. */
  export let rank = null;
  /** A row in the long list keeps its reasons folded away until they are asked for. */
  export let compact = false;
  /** The organization's adapted lamp colour, which is what the light is made of. */
  export let tone = 'var(--primary)';

  const dispatch = createEventDispatcher();

  let expanded = false;

  /** The colour a reason is read in. A reason is a sentence, never a tinted box. */
  const TONES = {
    positive: 'var(--ok)',
    warning: 'var(--warn)',
    neutral: 'var(--muted)',
  };

  const fmtDateTime = iso => campusDateTime(iso);
  const fmtTime = iso => campusTime(iso);

  $: shown = compact && !expanded ? [] : recommendation.insights;
</script>

<Lamp
  as="div"
  {tone}
  class="recommendation cut"
  width={560}
  height={200}
  fade={72}
  surface="var(--card)"
  reactive
>
  <div class="score">
    <Numeral value={recommendation.score} unit=" out of 100" size={34} />
  </div>

  <div class="body">
    <p class="when">{fmtDateTime(recommendation.start)} to {fmtTime(recommendation.end)}</p>
    <p class="where">
      <Icon name="pin" />
      <span>{recommendation.location.building} {recommendation.location.room_number}</span>
    </p>

    {#if shown.length}
      <ul class="why">
        {#each shown as insight}
          <li>
            <Pad tone={TONES[insight.type] ?? TONES.neutral} />
            <span>{insight.text}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="side">
    {#if rank === 1}
      <Highlight tone="var(--signal)">The best time found</Highlight>
    {:else if rank}
      <span class="rank">Number {rank} of the picks</span>
    {/if}
    <Button variant="secondary" size="sm" on="card" onclick={() => dispatch('select', recommendation)}>
      Use this time
    </Button>
    {#if compact}
      <Button variant="quiet" size="sm" onclick={() => expanded = !expanded}>
        {expanded ? 'Hide the reasons' : 'Why this time'}
      </Button>
    {/if}
  </div>
</Lamp>

<style>
  /*
   * Three columns, the way the event row is drawn: the number, the body, and
   * what you can do with it.
   */
  :global(.recommendation) {
    display: grid;
    grid-template-columns: 132px minmax(0, 1fr) auto;
    gap: 18px;
    align-items: start;
    padding: 16px 20px 16px 18px;
    --cut: 14px;
  }

  .score {
    padding-top: 2px;
  }

  .body {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .when {
    font-family: var(--display);
    font-stretch: 90%;
    font-weight: 700;
    font-size: 17px;
    margin: 0;
  }

  .where {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    font-size: 13px;
    color: var(--ink-2);
    margin: 0;
  }

  .why {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }

  .why li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: baseline;
    font-size: 13.5px;
    color: var(--ink-2);
  }

  .side {
    display: grid;
    gap: 8px;
    justify-items: end;
    align-content: start;
    font-size: 13px;
  }

  .rank {
    color: var(--muted);
    font-size: 12.5px;
  }

  @media (max-width: 720px) {
    :global(.recommendation) {
      grid-template-columns: 1fr;
    }

    .side {
      justify-items: start;
    }
  }
</style>
