<script>
  import { createEventDispatcher } from 'svelte';
  import { campusDateTime, campusTime } from './campusTime.js';

  // recommendation: { start, end, location, score, insights }
  export let recommendation;
  export let rank = null;      // 1-based rank for curated picks (null for list rows)
  export let compact = false;  // true for all-options list rows

  const dispatch = createEventDispatcher();

  let expanded = false; // for compact rows

  const INSIGHT_ICONS = { positive: '✅', warning: '⚠️', neutral: 'ℹ️' };

  function scoreColor(score) {
    if (score >= 80) return 'text-teal-600 dark:text-teal-400';
    if (score >= 60) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
  }

  const fmtDateTime = iso => campusDateTime(iso, { separator: ' · ' });
  const fmtTime = iso => campusTime(iso);

  $: topInsights = recommendation.insights.slice(0, 3);
  $: remainingInsights = recommendation.insights.slice(3);
</script>

{#if compact}
  <!-- Compact row for All Options list -->
  <div class="border rounded-lg bg-card transition-all">
    <div class="flex items-center gap-4 p-3">
      <span class="text-base font-bold w-12 shrink-0 {scoreColor(recommendation.score)}">{recommendation.score}%</span>
      <div class="flex-1 min-w-0">
        <p class="font-medium text-sm truncate">{fmtDateTime(recommendation.start)} to {fmtTime(recommendation.end)}</p>
        <p class="text-xs text-muted-foreground">{recommendation.location.building} {recommendation.location.room_number} · Cap {recommendation.location.max_capacity}</p>
      </div>
      <div class="hidden sm:flex flex-wrap gap-1 max-w-[200px]">
        {#each topInsights.slice(0, 2) as insight}
          <span class="text-[10px] px-1.5 py-0.5 rounded border
            {insight.type === 'positive' ? 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20'
             : insight.type === 'warning' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
             : 'bg-muted text-muted-foreground border-border'}">
            {insight.text.slice(0, 30)}{insight.text.length > 30 ? '…' : ''}
          </span>
        {/each}
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button
          class="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
          on:click={() => expanded = !expanded}
        >{expanded ? 'Less' : 'Details'}</button>
        <button
          class="px-3 py-1.5 text-xs font-semibold bg-primary/10 text-primary rounded hover:bg-primary hover:text-primary-foreground transition-all"
          on:click={() => dispatch('select', recommendation)}
        >Select</button>
      </div>
    </div>

    {#if expanded}
      <div class="border-t px-3 pb-3 pt-2 space-y-1">
        {#each recommendation.insights as insight}
          <p class="text-xs {insight.type === 'positive' ? 'text-teal-700 dark:text-teal-400' : insight.type === 'warning' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}">
            {INSIGHT_ICONS[insight.type]} {insight.text}
          </p>
        {/each}
      </div>
    {/if}
  </div>

{:else}
  <!-- Full card for Curated Picks -->
  <div class="border rounded-xl bg-card shadow-sm overflow-hidden">
    <div class="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
      <div class="flex items-center gap-2">
        {#if rank === 1}
          <span class="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">★ Top Pick</span>
        {:else if rank}
          <span class="text-xs font-medium text-muted-foreground">Pick #{rank}</span>
        {/if}
      </div>
      <span class="text-2xl font-bold {scoreColor(recommendation.score)}">{recommendation.score}<span class="text-sm font-normal">/100</span></span>
    </div>

    <div class="px-5 py-4 space-y-4">
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-0.5">Time Slot</p>
          <p class="font-semibold">{fmtDateTime(recommendation.start)}</p>
          <p class="text-xs text-muted-foreground">until {fmtTime(recommendation.end)}</p>
        </div>
        <div>
          <p class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-0.5">Venue</p>
          <p class="font-semibold">{recommendation.location.building} {recommendation.location.room_number}</p>
          <p class="text-xs text-muted-foreground">Capacity {recommendation.location.max_capacity}</p>
        </div>
      </div>

      <div>
        <p class="text-xs font-semibold text-muted-foreground mb-2">Why this slot:</p>
        <div class="space-y-1.5">
          {#each recommendation.insights as insight}
            <p class="text-sm flex items-start gap-2 {insight.type === 'positive' ? 'text-teal-700 dark:text-teal-400' : insight.type === 'warning' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}">
              <span class="shrink-0 mt-0.5">{INSIGHT_ICONS[insight.type]}</span>
              <span>{insight.text}</span>
            </p>
          {/each}
        </div>
      </div>

      <button
        class="w-full py-2 text-sm font-semibold bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-primary-foreground transition-all"
        on:click={() => dispatch('select', recommendation)}
      >
        Select this slot →
      </button>
    </div>
  </div>
{/if}
