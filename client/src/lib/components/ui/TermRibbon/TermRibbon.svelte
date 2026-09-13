<script>
  import { campusDate, campusStartOfDay } from '../../../campusTime.js';

  /**
   * The term ribbon.
   *
   * The whole term as one row of cells, one cell to a week, four pixels apart
   * and cut at ten. Each cell's ground is a mix of the well and the signal
   * colour, and how far along that mix it goes is the number of exams in the
   * week, which is what makes the term readable as a heat map. The count is
   * printed on every cell, warm or cool, so the colour is never the only way to
   * read it. The current week carries a breathing signal pad at its top right.
   *
   * See docs/design/07-components.md and docs/design/08-surfaces.md.
   */
  let {
    /** The weeks of the term, each one { start, count }, in the order they run. */
    weeks = [],
    /**
     * The start date of the week it is now. Left unset, no week is marked,
     * which is what a ribbon of a term that has not begun should look like.
     */
    current = null,
    /** The left half of the caption row, saying what the cells count. */
    caption = 'exams per week, from the start of term',
    /** The right half of the caption row, where the page has something to add. */
    note = null,
    class: className = '',
    ...rest
  } = $props();

  /**
   * How much warmer one exam makes a week, in percent of the way from the well
   * to the signal colour. Thirteen points an exam puts the four exam week of
   * the reference render at the top of the ramp, and the ramp stops there,
   * because a proportion past one hundred percent is not a colour.
   */
  const HEAT_PER_EXAM = 13;

  /** Three exams in one week is the point where the count turns signal. */
  const HOT_FROM = 3;

  /**
   * A week names a day rather than an instant. Read straight, a date with no
   * time on it is midnight in UTC, which is the evening before on campus, and
   * the ribbon labelled every week a day early. Naming the hour has it read as
   * campus time, which is what a date on this site means.
   */
  const asCampusDay = day => `${campusStartOfDay(day)}T00:00`;

  const said = count => {
    if (!count) return 'no exams';
    return count === 1 ? '1 exam' : `${count} exams`;
  };

  const cells = $derived(
    weeks.map(week => {
      const count = Number(week.count ?? 0);
      const day = campusStartOfDay(week.start);
      const now = current !== null && day === campusStartOfDay(current);
      const date = campusDate(asCampusDay(week.start), { month: 'short', day: 'numeric' });
      return {
        day,
        date,
        count,
        now,
        heat: Math.min(count * HEAT_PER_EXAM, 100),
        hot: count >= HOT_FROM,
        // A screen reader is given the week as a sentence, because "0 Aug 24"
        // read aloud is two numbers and no meaning.
        label: `Week of ${date} has ${said(count)}.${now ? ' This is the current week.' : ''}`,
      };
    }),
  );
</script>

{#if cells.length}
  <div
    class={['ribbon', className].filter(Boolean).join(' ')}
    style="--weeks: {cells.length}"
    role="list"
    aria-label="Exams in each week of the term"
    {...rest}
  >
    {#each cells as cell (cell.day)}
      <div
        class={['wkc', 'cut', cell.now && 'now', cell.hot && 'hot'].filter(Boolean).join(' ')}
        style="--heat: {cell.heat}"
        role="listitem"
        aria-label={cell.label}
        aria-current={cell.now ? 'date' : undefined}
      ><b>{cell.count}</b><span><time datetime={cell.day}>{cell.date}</time></span></div>
    {/each}
  </div>
  <div class="ribcap">
    <span>{caption}</span>
    {#if note}<span>{note}</span>{/if}
  </div>
{/if}

<style>
  /*
   * The pad on the current week breathes, which docs/design/06-shape-space-motion.md
   * asks of the pad on whatever is happening now. The reference page is a still
   * drawing, so its stylesheet draws the pad and never starts it; the keyframes
   * it turns on are the ones in the block copied into app.css, and nothing else
   * about the pad is restated here. The reduced motion rule in that block stops
   * it, because it reaches pseudo elements.
   */
  .wkc.now::after {
    animation: pulse 1.6s ease-in-out infinite;
  }
</style>
