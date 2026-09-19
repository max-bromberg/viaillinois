<script>
  import { createEventDispatcher } from 'svelte';
  import { Pad } from './components/ui/index.js';

  /**
   * How much each day of the week matters to the search.
   *
   * A day is clicked through the four answers and back to nothing. The answer
   * is written out in full beside the day, because "SP" and "NtH" were shorter
   * to draw and told a board nothing at all.
   */

  // value: Array<{ day: string, tier: 'required'|'strongly_preferred'|'nice_to_have'|'excluded' }>
  export let value = [];

  const dispatch = createEventDispatcher();

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const TIER_CYCLE = [null, 'required', 'strongly_preferred', 'nice_to_have', 'excluded'];
  const TIER_LABELS = {
    required: 'required',
    strongly_preferred: 'strongly preferred',
    nice_to_have: 'nice to have',
    excluded: 'excluded',
  };
  /** The colour each answer is read in, from the tokens the rest of the site uses. */
  const TIER_TONES = {
    required: 'var(--primary)',
    strongly_preferred: 'var(--cat-4)',
    nice_to_have: 'var(--cat-6)',
    excluded: 'var(--danger)',
  };

  // Reactive map so Svelte tracks `value` as an explicit dependency
  $: tierMap = Object.fromEntries(value.map(d => [d.day, d.tier]));

  function cycleDay(day) {
    const current = tierMap[day] ?? null;
    const idx = TIER_CYCLE.indexOf(current);
    const next = TIER_CYCLE[(idx + 1) % TIER_CYCLE.length];
    let updated;
    if (next === null) {
      updated = value.filter(d => d.day !== day);
    } else if (current !== null) {
      updated = value.map(d => d.day === day ? { ...d, tier: next } : d);
    } else {
      updated = [...value, { day, tier: next }];
    }
    dispatch('change', updated);
  }
</script>

<div class="days">
  {#each DAYS as day}
    {@const tier = tierMap[day] ?? null}
    <button
      type="button"
      class="check"
      aria-pressed={tier !== null}
      on:click={() => cycleDay(day)}
    >
      <Pad tone={tier ? TIER_TONES[tier] : null} hollow={!tier} />
      <span class="weekday">{day}</span>
      {#if tier}<span class="tier">{TIER_LABELS[tier]}</span>{/if}
    </button>
  {/each}
</div>

<p class="how">
  Click a day to say how much it matters. It runs from nothing to required, then strongly
  preferred, then nice to have, then excluded, and back to nothing.
</p>

<style>
  .days {
    display: grid;
    gap: 2px 20px;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  }

  .check {
    font: inherit;
    font-size: 14px;
    background: none;
    border: 0;
    padding: 0;
    gap: 10px;
    color: var(--ink);
    cursor: pointer;
    justify-content: flex-start;
  }

  .check:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  .weekday {
    font-family: var(--display);
    font-stretch: 85%;
    font-weight: 700;
    min-width: 32px;
  }

  .tier {
    color: var(--muted);
    font-size: 13px;
  }

  .how {
    font-size: 12.5px;
    color: var(--muted);
    margin-top: 8px;
    max-width: 52ch;
  }
</style>
