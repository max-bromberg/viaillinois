<script>
  import { Numeral } from '../Numeral/index.js';

  /**
   * The greeting.
   *
   * Every arrival gets a sentence written for the moment: the time of day, what
   * is on tonight, how far the next midterm is. Signed in it uses the person's
   * first name and counts only the organizations they follow. A student opening
   * the site between classes should feel that the page knows what time it is and
   * where they are, which is what makes a tool feel personal rather than
   * generated.
   *
   * The line of counts is a live region that speaks once when the counts arrive,
   * rather than reading the whole band again every time a number changes.
   *
   * See docs/design/08-surfaces.md and docs/design/10-voice.md.
   */
  let {
    /** The campus hour, which decides the greeting. */
    hour = 12,
    /** The person's first name. Without one the page greets Illinois. */
    name = null,
    /** A page title, which stands in place of the greeting away from the feed. */
    title = null,
    /** How many events are on tonight. */
    tonight = null,
    /**
     * A building to count tonight's events in. Left unset, tonight is the whole
     * of campus, which is what the site is: the organizations it serves belong
     * to a department and meet in several buildings between them. The lobby
     * screen names its own building, because there it is the right question.
     */
    where = null,
    /** How many events are on this week. */
    week = null,
    /** The next midterm: how many days away, and which course. */
    midterm = null,
    class: className = '',
    children,
    ...rest
  } = $props();

  /** Morning until eleven, afternoon until five, evening after that. */
  const said = $derived(hour < 11 ? 'Good morning,' : hour < 17 ? 'Good afternoon,' : 'Good evening,');
</script>

<div class={['greet', className].filter(Boolean).join(' ')} {...rest}>
  <div>
    <!--
      A page title is the page's own first level heading, and it happens to be
      set in the band. The greeting is not a heading of that kind: it names the
      reader, and the agenda under it carries the page's structure.
    -->
    {#if title}
      <h1>{title}</h1>
    {:else}
      <h2>{said} <b>{name ? `${name}.` : 'Illinois.'}</b></h2>
    {/if}
    <div class="line" aria-live="polite" aria-atomic="true">
      {#if tonight !== null}
        <span><Numeral value={tonight} unit={where ? `tonight in ${where}` : 'tonight'} hot /></span>
      {/if}
      {#if week !== null}
        <span><Numeral value={week} unit="this week" /></span>
      {/if}
      {#if midterm}
        <span><Numeral value={midterm.days} unit={`days to the ${midterm.course} midterm`} /></span>
      {/if}
    </div>
  </div>
  {@render children?.()}
</div>
