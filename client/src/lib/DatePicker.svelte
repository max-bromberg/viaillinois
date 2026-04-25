<script>
  import { createEventDispatcher, onMount } from 'svelte';

  export let value = '';        // YYYY-MM-DD string
  export let placeholder = 'Pick a date';
  export let min = '';
  export let max = '';

  const dispatch = createEventDispatcher();

  let open = false;
  let viewYear = 0;
  let viewMonth = 0;
  let el;

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  function initView() {
    const d = value ? new Date(value + 'T00:00:00') : new Date();
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
  }
  initView();

  $: if (value !== undefined) initView();

  $: selectedParts = value
    ? { y: parseInt(value.slice(0,4)), m: parseInt(value.slice(5,7)) - 1, d: parseInt(value.slice(8,10)) }
    : null;

  $: calendarDays = buildCalendar(viewYear, viewMonth);

  function buildCalendar(year, month) {
    const startDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }

  function selectDay(day) {
    if (!day || isDisabled(day)) return;
    const m = String(viewMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    value = `${viewYear}-${m}-${d}`;
    dispatch('change', value);
    open = false;
  }

  function prevMonth() {
    if (viewMonth === 0) { viewMonth = 11; viewYear--; }
    else viewMonth--;
  }
  function nextMonth() {
    if (viewMonth === 11) { viewMonth = 0; viewYear++; }
    else viewMonth++;
  }

  function formatDisplay(v) {
    if (!v) return null;
    const d = new Date(v + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function isSelected(day) {
    if (!selectedParts || !day) return false;
    return selectedParts.y === viewYear && selectedParts.m === viewMonth && selectedParts.d === day;
  }

  function isToday(day) {
    const t = new Date();
    return t.getFullYear() === viewYear && t.getMonth() === viewMonth && t.getDate() === day;
  }

  function isDisabled(day) {
    if (!day) return true;
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (min && dateStr < min) return true;
    if (max && dateStr > max) return true;
    return false;
  }

  onMount(() => {
    function handleOutside(e) {
      if (el && !el.contains(e.target)) open = false;
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  });
</script>

<div class="relative" bind:this={el}>
  <!-- Trigger button -->
  <button
    type="button"
    class="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left border rounded-md bg-background
      hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30
      {value ? 'text-foreground' : 'text-muted-foreground'}"
    on:click={() => open = !open}
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-muted-foreground">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
    <span class="flex-1 truncate">{formatDisplay(value) ?? placeholder}</span>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-muted-foreground transition-transform {open ? 'rotate-180' : ''}">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </button>

  <!-- Calendar dropdown -->
  {#if open}
    <div class="absolute z-50 mt-1.5 bg-card border rounded-xl shadow-xl p-3 w-64 select-none"
      style="left: 0; top: 100%;">

      <!-- Month / year nav -->
      <div class="flex items-center justify-between mb-3">
        <button
          type="button"
          class="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          on:click={prevMonth}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="text-sm font-semibold">{MONTHS[viewMonth]} {viewYear}</span>
        <button
          type="button"
          class="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          on:click={nextMonth}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <!-- Day-of-week headers -->
      <div class="grid grid-cols-7 mb-1">
        {#each DOW as d}
          <div class="text-center text-[10px] font-semibold text-muted-foreground py-1">{d}</div>
        {/each}
      </div>

      <!-- Day cells -->
      <div class="grid grid-cols-7 gap-y-0.5">
        {#each calendarDays as day}
          {#if day === null}
            <div></div>
          {:else}
            <button
              type="button"
              disabled={isDisabled(day)}
              class="h-8 w-full rounded-md text-xs font-medium transition-colors focus:outline-none
                {isSelected(day)
                  ? 'bg-primary text-primary-foreground'
                  : isToday(day)
                  ? 'border border-primary text-primary hover:bg-primary/10'
                  : isDisabled(day)
                  ? 'text-muted-foreground/40 cursor-not-allowed'
                  : 'hover:bg-accent text-foreground'}"
              on:click={() => selectDay(day)}
            >{day}</button>
          {/if}
        {/each}
      </div>

      <!-- Clear button if value set -->
      {#if value}
        <div class="mt-2 pt-2 border-t">
          <button
            type="button"
            class="w-full text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
            on:click={() => { value = ''; dispatch('change', ''); open = false; }}
          >Clear</button>
        </div>
      {/if}
    </div>
  {/if}
</div>
