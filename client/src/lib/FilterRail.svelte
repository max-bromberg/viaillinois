<script>
  import { Pad, Highlight, Field } from './components/ui/index.js';
  import { tagNames } from './tagList.js';
  import { tagHue } from './tagHue.js';
  import { organizationColor } from './organizationColor.js';
  import { resolvedTheme } from '../stores/theme.js';
  import DatePicker from './DatePicker.svelte';

  /**
   * The filter rail.
   *
   * Words, not a panel. Where the feed used to carry a bordered box holding
   * uppercase captions, pills and checkboxes, it now carries five headings and
   * the site's own shapes under each: two words for the timeframe with the
   * active one underlined, a field with no box, tags as highlights,
   * organizations as pads and names, and the internal events control as a pad.
   *
   * See docs/design/08-surfaces.md.
   */
  let {
    /** The organizations there are to filter by. */
    rsos = [],
    /** What happens when anything in the rail changes. */
    onchange = undefined,
    class: className = '',
  } = $props();

  /**
   * The timeframe keeps the name the API gives it, and the Discord companion
   * reads the same name. What a reader is shown is "Past", because that is what
   * happened to those events; nobody filed them anywhere.
   */
  const TIMEFRAMES = [
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'archived', label: 'Past' },
  ];

  let keyword = $state('');
  let selectedTags = $state([]);
  let startDate = $state('');
  let endDate = $state('');
  let selectedRsoIds = $state([]);
  let showInternal = $state(true);
  let timeframe = $state('upcoming');
  /**
   * On a phone the page grid puts the rail above the agenda, and five headings
   * of rail is more than a screen, so the rail folds behind an opener the way
   * the calendar's rail already does.
   */
  let open = $state(false);

  const theme = $derived($resolvedTheme);

  const filtered = $derived(
    keyword !== '' || selectedTags.length > 0 || startDate !== '' || endDate !== ''
      || selectedRsoIds.length > 0 || !showInternal || timeframe !== 'upcoming',
  );

  function report() {
    onchange?.({
      keyword,
      tags: selectedTags,
      startDate,
      endDate,
      timeframe,
      selectedRsoIds,
      showInternal,
    });
  }

  function chooseTimeframe(value) {
    if (timeframe === value) return;
    timeframe = value;
    report();
  }

  function toggleTag(tag) {
    selectedTags = selectedTags.includes(tag)
      ? selectedTags.filter(chosen => chosen !== tag)
      : [...selectedTags, tag];
    report();
  }

  function toggleRso(rsoId) {
    selectedRsoIds = selectedRsoIds.includes(rsoId)
      ? selectedRsoIds.filter(id => id !== rsoId)
      : [...selectedRsoIds, rsoId];
    report();
  }

  function toggleInternal() {
    showInternal = !showInternal;
    report();
  }

  function clear() {
    keyword = '';
    selectedTags = [];
    startDate = '';
    endDate = '';
    selectedRsoIds = [];
    showInternal = true;
    timeframe = 'upcoming';
    report();
  }

  /**
   * No organization chosen means every organization is shown, so every pad is
   * filled. Once one is chosen the rest are hollow, which says which are in and
   * which are out by shape rather than by colour alone.
   */
  const chosen = rso => selectedRsoIds.length === 0 || selectedRsoIds.includes(rso.rso_id);
</script>

<aside class={['rail', className].filter(Boolean).join(' ')} aria-label="Filter the agenda">
  <!-- On a phone the rail folds away, because the agenda is what was opened. -->
  <button
    type="button"
    class="btn quiet opener"
    aria-expanded={open}
    aria-controls="agenda-filters"
    aria-label={filtered ? 'Filters, some of them on' : undefined}
    onclick={() => { open = !open; }}
  >
    <Pad hollow={!filtered} />Filters
  </button>

  <div id="agenda-filters" class="groups" class:open>
    <div>
      <h3>When</h3>
      <div class="when">
        {#each TIMEFRAMES as option (option.value)}
          {#if timeframe === option.value}
            <b><button type="button" aria-pressed="true" onclick={() => chooseTimeframe(option.value)}>{option.label}</button></b>
          {:else}
            <span><button type="button" aria-pressed="false" onclick={() => chooseTimeframe(option.value)}>{option.label}</button></span>
          {/if}
        {/each}
      </div>
      <!--
        A date range asks the same question the two words do, so it sits under the
        same heading rather than adding a sixth to a rail of five.
      -->
      <DatePicker bind:value={startDate} placeholder="From" on:change={report} />
      <DatePicker bind:value={endDate} placeholder="Until" min={startDate} on:change={report} />
    </div>

    <div>
      <h3>Search</h3>
      <Field
        label="Search the agenda"
        labelHidden
        placeholder="Keyword"
        bind:value={keyword}
        oninput={report}
      />
    </div>

    <div>
      <h3>Tags</h3>
      <div class="hlrow">
        {#each $tagNames as tag (tag)}
          <Highlight
            tone={tagHue(tag)}
            off={!selectedTags.includes(tag)}
            pressed={selectedTags.includes(tag)}
            onclick={() => toggleTag(tag)}
          >{tag}</Highlight>
        {/each}
      </div>
    </div>

    {#if rsos.length > 0}
      <div>
        <h3>Organizations</h3>
        <div class="orgs">
          {#each rsos as rso (rso.rso_id)}
            <span
              role="checkbox"
              tabindex="0"
              aria-checked={String(chosen(rso))}
              onclick={() => toggleRso(rso.rso_id)}
              onkeydown={event => {
                if (event.key !== ' ' && event.key !== 'Enter') return;
                event.preventDefault();
                toggleRso(rso.rso_id);
              }}
            >
              <Pad tone={organizationColor(rso.logo_color, 'mark', theme)} hollow={!chosen(rso)} />{rso.name}
            </span>
          {/each}
        </div>
      </div>
    {/if}

    <div>
      <h3>Show</h3>
      <span
        class="check"
        role="checkbox"
        tabindex="0"
        aria-checked={String(showInternal)}
        onclick={toggleInternal}
        onkeydown={event => {
          if (event.key !== ' ' && event.key !== 'Enter') return;
          event.preventDefault();
          toggleInternal();
        }}
      >
        <Pad hollow={!showInternal} />Internal events
      </span>
    </div>

    {#if filtered}
      <div>
        <button type="button" class="clear" onclick={clear}>Clear the filters</button>
      </div>
    {/if}
  </div>
</aside>

<style>
  /*
   * The rail's own rules come from the reference stylesheet and are written
   * against .rail, so the blocks now sit inside a wrapper that takes the same
   * grid rather than the wrapper becoming a single tall block of its own.
   */
  .groups {
    display: grid;
    gap: 26px;
    align-content: start;
  }

  /*
   * Each block of the rail is a grid item, and a grid item's automatic minimum
   * size is its own content, which beats any width the track gives it. Without
   * this the tag row set its own width from the longest tag and the rail leaned
   * across the agenda. Scoped with the child combinator, because a rule written
   * for the outer blocks would otherwise reach the rows inside them.
   */
  .groups > div {
    min-width: 0;
  }

  /*
   * The opener belongs to the phone. The breakpoint is the one at which the page
   * grid stops putting the rail beside the agenda and starts putting it above,
   * so the rail folds at exactly the moment it would otherwise push the agenda
   * off the screen.
   */
  .opener {
    display: none;
  }

  @media (max-width: 900px) {
    .opener {
      display: inline-flex;
      justify-self: start;
    }

    .groups {
      display: none;
    }

    .groups.open {
      display: grid;
    }
  }

  .opener:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  /*
   * The two timeframe words carry their weight and their underline from the
   * .rail .when rules copied from the reference stylesheet, so the buttons
   * inside them bring nothing of their own.
   */
  .when button,
  .orgs span,
  .check {
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .when button:focus-visible,
  .orgs span:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  .clear {
    font: inherit;
    font-family: var(--display);
    font-stretch: 85%;
    font-weight: 700;
    font-size: 13.5px;
    color: var(--muted);
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    min-height: 32px;
  }

  .clear:hover {
    color: var(--ink);
  }

  .clear:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }
</style>
