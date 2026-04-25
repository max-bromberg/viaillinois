<script>
  import { createEventDispatcher } from 'svelte';

  // value: Array<{ day: string, tier: 'required'|'strongly_preferred'|'nice_to_have'|'excluded' }>
  export let value = [];

  const dispatch = createEventDispatcher();

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const TIER_CYCLE = [null, 'required', 'strongly_preferred', 'nice_to_have', 'excluded'];
  const TIER_LABELS = {
    required: 'Req',
    strongly_preferred: 'SP',
    nice_to_have: 'NtH',
    excluded: 'Off',
  };
  const TIER_CLASSES = {
    required: 'bg-primary text-primary-foreground border-primary',
    strongly_preferred: 'bg-amber-500 text-white border-amber-500',
    nice_to_have: 'bg-sky-500 text-white border-sky-500',
    excluded: 'bg-muted text-muted-foreground border-muted line-through',
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

<div class="flex flex-wrap gap-1.5">
  {#each DAYS as day}
    {@const tier = tierMap[day] ?? null}
    <button
      type="button"
      class="px-2.5 py-1 text-xs font-medium rounded border transition-all
        {tier ? TIER_CLASSES[tier] : 'border-border hover:bg-accent text-foreground'}"
      on:click={() => cycleDay(day)}
      title="{day}: {tier ? TIER_LABELS[tier] : 'unset — click to set'}"
    >
      {day}{tier ? ` · ${TIER_LABELS[tier]}` : ''}
    </button>
  {/each}
</div>

<p class="text-[10px] text-muted-foreground mt-1">
  Click a day to cycle: unset → Required → Strongly Preferred → Nice to Have → Excluded
</p>
