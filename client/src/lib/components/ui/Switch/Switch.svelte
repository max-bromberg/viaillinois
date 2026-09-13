<script>
  import { Pad } from '../Pad/index.js';

  /**
   * A switch.
   *
   * A 54 by 22 pixel control: a 2 pixel track and a 12 pixel pad. Off, the track
   * is the strong line colour and the pad sits faint at the left. On, the track
   * is the Current gradient and the pad is primary at the right. The pad slides,
   * which is the movement that says the setting is changing.
   *
   * Meaning never rides on colour alone, so the state is in where the pad is and
   * in what the control says it is, as well as in the colour of the track.
   *
   * See docs/design/07-components.md.
   */
  let {
    /** What the switch controls. It is the control's name to a screen reader. */
    label,
    /** Whether it is on. */
    checked = $bindable(false),
    disabled = false,
    /** What happens when it is turned, given the state it is turning to. */
    onchange = undefined,
    class: className = '',
    ...rest
  } = $props();

  function turn() {
    if (disabled) return;
    checked = !checked;
    onchange?.(checked);
  }

  function onkeydown(event) {
    // A switch answers the space bar and the enter key. Left as a div with a
    // click handler it would answer neither, which is most of the way to not
    // being a control at all.
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    turn();
  }
</script>

<span
  class={['tswitch', checked && 'on', className].filter(Boolean).join(' ')}
  role="switch"
  aria-checked={String(checked)}
  aria-label={label}
  aria-disabled={disabled ? 'true' : undefined}
  tabindex={disabled ? -1 : 0}
  onclick={turn}
  {onkeydown}
  {...rest}
><Pad /></span>

<style>
  .tswitch {
    cursor: pointer;
  }

  .tswitch[aria-disabled="true"] {
    cursor: default;
    opacity: 0.55;
  }
</style>
