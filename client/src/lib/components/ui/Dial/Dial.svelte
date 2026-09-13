<script>
  import { Pad } from '../Pad/index.js';
  import { Icon } from '../Icon/index.js';

  /**
   * The dial.
   *
   * The theme control: a pill with a 1.5 pixel outline holding a sun, a pad, the
   * current mode's name in the display face, and a moon. The pad sits beside the
   * active mode and slides when the mode changes.
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

  const STOPS = [
    { value: 'light', name: 'Light' },
    { value: 'auto', name: 'Follow the system' },
    { value: 'dark', name: 'Dark' },
  ];

  /** What the pill says, which is the name of the mode rather than of the stop. */
  const NAMES = { light: 'Light', auto: 'Auto', dark: 'Dark' };

  const at = $derived(Math.max(0, STOPS.findIndex(stop => stop.value === mode)));

  /**
   * The fifth movement: the dial turns and the pad slides along it over 400
   * milliseconds rather than snapping.
   *
   * The pad is drawn inside whichever stop is active, so a change destroys it in
   * one stop and builds it in the next and it lands there with no journey. What
   * happens instead is that the new pad is put back where the old one was and
   * then moved to where it belongs, which reads as one pad travelling and costs
   * the layout nothing, because the pad still sits in its stop the whole time.
   *
   * Stillness is honoured here rather than in the stylesheet, because this is
   * drawn by the browser's animation interface and no stylesheet reaches it.
   */
  let pad = $state(null);
  let cameFrom = null;

  const wantsStillness = () => typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  $effect(() => {
    // Named so that the effect runs again when the dial is turned.
    void at;
    const element = pad;
    if (!element || typeof element.animate !== 'function') return;
    const { left } = element.getBoundingClientRect();
    const from = cameFrom;
    cameFrom = left;
    if (from === null || from === left || wantsStillness()) return;
    element.animate(
      [{ transform: `translateX(${from - left}px)` }, { transform: 'none' }],
      { duration: 400, easing: 'ease-in-out' },
    );
  });

  function turn(value) {
    if (value === mode) return;
    onchange?.(value);
  }

  function onkeydown(event) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
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
  {#each STOPS as stop, index (stop.value)}
    <span
      class="stop"
      role="radio"
      aria-checked={String(stop.value === mode)}
      aria-label={stop.value === 'auto' ? stop.name : undefined}
      tabindex={index === at ? 0 : -1}
      onclick={() => turn(stop.value)}
      {onkeydown}
    >
      {#if index === at}<Pad bind:element={pad} />{/if}
      {#if stop.value === 'light'}<Icon name="sun" label="Light" />{/if}
      {#if stop.value === 'auto'}<b>{NAMES[mode] ?? NAMES.auto}</b>{/if}
      {#if stop.value === 'dark'}<Icon name="moon" label="Dark" />{/if}
    </span>
  {/each}
</span>

<style>
  .stop {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    /* A 32 px target, like every other control on the site. */
    min-height: 32px;
  }

  .stop:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
    border-radius: 2px;
  }
</style>
