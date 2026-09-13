<script>
  import { onMount } from 'svelte';
  import { Pad } from '../Pad/index.js';

  /**
   * A toast.
   *
   * An ink slab with paper text, cut at the top right, floating, with a
   * breathing pad at its left. It says what happened, in the past tense or as a
   * fact: "On the feed." "Link copied." The first words are bold in the display
   * face and the rest sits beside them.
   *
   * It is announced as a status, which speaks without taking the focus away from
   * whatever somebody is doing, and it goes after six seconds or when it is
   * dismissed. An error is given no duration, because a sentence that says the
   * feed did not load should still be there when the reader looks up.
   *
   * See docs/design/07-components.md.
   */
  let {
    /** The first words, set bold in the display face. */
    lead = null,
    /** The rest of the sentence. */
    message = '',
    /**
     * signal for something going live, which is what the signal colour is for,
     * and primary for something the site did, such as a link being made.
     */
    tone = 'signal',
    /** How long it stays, in milliseconds. Zero stays until it is dismissed. */
    duration = 6000,
    /** What happens when it goes. */
    ondismiss = undefined,
    class: className = '',
    ...rest
  } = $props();

  onMount(() => {
    if (duration <= 0) return undefined;
    const timer = setTimeout(() => ondismiss?.(), duration);
    return () => clearTimeout(timer);
  });
</script>

<div
  class={['toast', 'cut', className].filter(Boolean).join(' ')}
  style="--cut: 10px"
  role="status"
  aria-live="polite"
  {...rest}
>
  <Pad tone="var(--{tone})" breathing />
  <span class="said">{#if lead}<b>{lead}</b>{/if}{#if lead && message}{' '}{/if}{message}</span>
  <button type="button" class="go" onclick={() => ondismiss?.()} aria-label="Dismiss">
    <span aria-hidden="true">×</span>
  </button>
</div>

<style>
  .said {
    /* The lead and the rest are one sentence, so they wrap as one. */
    min-width: 0;
  }

  .go {
    font: inherit;
    font-size: 18px;
    line-height: 1;
    background: none;
    border: 0;
    color: inherit;
    opacity: 0.7;
    cursor: pointer;
    margin-left: 6px;
    /* A 32 px target, like every other control on the site. */
    min-width: 32px;
    min-height: 32px;
  }

  .go:hover,
  .go:focus-visible {
    opacity: 1;
  }

  .go:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
</style>
