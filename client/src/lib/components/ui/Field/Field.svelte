<script>
  import { Pad } from '../Pad/index.js';

  /**
   * A field.
   *
   * There is no box around a field. It is a label in the display face, then a
   * line: a pad, the input, and a rule under them; then help text. The pad and
   * the rule carry the state, in the same three colours the rest of the site
   * uses for rest, focus and error.
   *
   * The reference stylesheet shows the focus state with a class, because the
   * reference page is a drawing and nothing on it is ever focused. The class is
   * kept and toggled here, so that the state the client draws is the state the
   * reference was approved on.
   *
   * See docs/design/07-components.md.
   */
  let {
    /** What the field is called. */
    label,
    /**
     * Keep the name for a screen reader but draw no label. The filter rail heads
     * its search with a word of its own, and a second one under it would be a
     * label above a heading, which the look does not have.
     */
    labelHidden = false,
    /** The value, which the caller may bind to. */
    value = $bindable(''),
    /** What kind of input. */
    type = 'text',
    /** The input's id. One is made where none is given, so the label always reaches it. */
    id = null,
    /** A sentence under the field saying what it wants. */
    help = null,
    /** What is wrong, in words. An error is a sentence, never a red box. */
    error = null,
    required = false,
    disabled = false,
    placeholder = null,
    class: className = '',
    ...rest
  } = $props();

  const inputId = $derived(id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
  const helpId = $derived(`${inputId}-help`);
  const message = $derived(error ?? help);

  let focused = $state(false);

  const classes = $derived(['fld', focused && 'focus', error && 'err', className].filter(Boolean).join(' '));
</script>

<div class={classes}>
  <label for={inputId} class:hidden={labelHidden}>{label}{#if required}<span class="need"> (required)</span>{/if}</label>
  <div class="in">
    <Pad />
    <input
      id={inputId}
      {type}
      {required}
      {disabled}
      {placeholder}
      bind:value
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={message ? helpId : undefined}
      onfocusin={() => { focused = true; }}
      onfocusout={() => { focused = false; }}
      {...rest}
    />
  </div>
  {#if message}<p class="help" id={helpId}>{message}</p>{/if}
</div>

<style>
  /*
   * Required is said in words as well as by an asterisk nobody reads out. It is
   * set in the reading face beside the label rather than in the display face, so
   * that it reads as a note and not as part of the name.
   */
  /*
   * Out of sight and still spoken. Left as display:none it would be out of the
   * accessibility tree too, and the field would have no name at all.
   */
  .hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .need {
    font-family: var(--sans);
    font-stretch: normal;
    font-weight: 400;
    color: var(--muted);
  }
</style>
