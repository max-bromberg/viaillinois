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
    /** Where tonight's events are, usually the building. */
    where = 'ECEB',
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
    <h2>{#if title}<b>{title}</b>{:else}{said} <b>{name ? `${name}.` : 'Illinois.'}</b>{/if}</h2>
    <div class="line" aria-live="polite" aria-atomic="true">
      {#if tonight !== null}
        <span><Numeral value={tonight} unit={`tonight in ${where}`} hot /></span>
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
