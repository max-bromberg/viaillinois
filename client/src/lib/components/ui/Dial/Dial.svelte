<script>
  import { Icon } from '../Icon/index.js';

  /**
   * The dial.
   *
   * The theme control: three stops on a track, a sun, the word Auto and a moon,
   * with a thumb that sits behind whichever is chosen and travels when the dial
   * is turned.
   *
   * It used to show the name of the current mode in the middle stop, so in the
   * light theme the middle of the dial read "Light" and clicking it selected
   * auto. A control that says one thing and does another is worse than one with
   * no label at all, so each stop says what it is, permanently, and what is
   * chosen is shown by where the thumb is rather than by what the words say.
   *
   * An icon never appears without a label. The dial is the one place the site
   * takes the exception in docs/design/09-accessibility.md, so the sun and the
   * moon carry names of their own rather than leaning on words beside them.
   *
   * See docs/design/07-components.md.
   */
  let {
    /** Which mode: light, auto or dark. */
    mode = 'auto',
    /** What happens when it is turned, given the mode it is turning to. */
    onchange = undefined,
    class: className = '',
    ...rest
  } = $props();

  /**
   * The three stops, each saying what choosing it does rather than what is
   * currently true. "Follow the system" is the whole of what auto means, and it
   * is the one stop whose meaning a person cannot guess from a picture.
   */
  const STOPS = [
    { value: 'light', name: 'Light' },
    { value: 'auto', name: 'Follow the system' },
    { value: 'dark', name: 'Dark' },
  ];

  const at = $derived(Math.max(0, STOPS.findIndex(stop => stop.value === mode)));

  function turn(value) {
    if (value !== mode) onchange?.(value);
  }

  function onkeydown(event) {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (step === undefined) {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      return;
    }
    event.preventDefault();
    // The ends of the dial are the light theme and the dark theme, and they mean
    // something, so the dial stops at them rather than wrapping round to the
    // other end of the day.
    const next = at + step;
    if (next < 0 || next >= STOPS.length) return;
    turn(STOPS[next].value);
  }
</script>

<span class={['dial', className].filter(Boolean).join(' ')} role="radiogroup" aria-label="Color theme" {...rest}>
  <!--
    One thumb for the whole dial rather than a marker rebuilt inside whichever
    stop is active. Built in place it is destroyed in one stop and created in
    the next, so it arrives with no journey; travelling by index it is the same
    element throughout and the movement is the browser's to make.
  -->
  <span class="thumb" style="--at: {at}" aria-hidden="true"></span>

  {#each STOPS as stop, index (stop.value)}
    <span
      class="stop"
      class:on={index === at}
      role="radio"
      aria-checked={String(stop.value === mode)}
      aria-label={stop.name}
      tabindex={index === at ? 0 : -1}
      onclick={() => turn(stop.value)}
      {onkeydown}
    >
      {#if stop.value === 'light'}<Icon name="sun" />{/if}
      {#if stop.value === 'auto'}<b>Auto</b>{/if}
      {#if stop.value === 'dark'}<Icon name="moon" />{/if}
    </span>
  {/each}
</span>

<style>
  /*
   * The track is three stops wide and the thumb is one of them, so the thumb's
   * travel is a fraction of the dial rather than a pixel measurement that has
   * to be kept in step with the padding.
   */
  .dial {
    position: relative;
    isolation: isolate;
  }

  .thumb {
    position: absolute;
    z-index: -1;
    top: 4px;
    bottom: 4px;
    left: 4px;
    width: var(--stop-width, 34px);
    background: var(--g-current);
    border-radius: 999px;
    transform: translateX(calc(var(--at) * var(--stop-step, 44px)));
    transition: transform 380ms cubic-bezier(.22, .61, .36, 1);
  }

  .stop {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    /* A 32 px target, like every other control on the site. */
    min-height: 32px;
    min-width: var(--stop-width, 34px);
    color: var(--muted);
    transition: color 200ms ease;
  }

  .stop:hover {
    color: var(--ink);
  }

  /* What is chosen sits on the thumb, so it takes the thumb's own ink. */
  .stop.on,
  .stop.on :global(b) {
    color: var(--primary-fg);
  }

  .stop:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
    border-radius: 2px;
  }

  /*
   * Stillness for anybody who asks for it. The thumb still moves, because where
   * it is carries the meaning, and it arrives without the journey.
   */
  @media (prefers-reduced-motion: reduce) {
    .thumb { transition: none; }
  }
</style>
