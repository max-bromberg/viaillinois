<script>
  import { pageTitle, bandShowsTitle } from '../stores/ui.js';

  /**
   * A reading page.
   *
   * About, the updates, the terms and the privacy policy are pages somebody
   * reads rather than pages somebody works in, and they were drawn as a stack
   * of bordered cards with a heading in each one. A reader who wants to know
   * what VIA stores about them should get a document, so what is here is a
   * document: the page title in the condensed display face at 56 px, then
   * prose in Plex Sans at a 62 character measure with headings at 30 px.
   *
   * The page title goes in the sky band, in place of the greeting. The title
   * travels there through the store in stores/ui.js, and this draws its own
   * heading only where the band is not showing one, so that no surface ends up
   * with no heading at all.
   *
   * See docs/design/08-surfaces.md and docs/design/05-typography.md.
   */
  let {
    /** The page title, which is the page's one first level heading. */
    title,
    /** A line of dates under the title, which the terms and the policy carry. */
    dateline = null,
    /** How wide the reading column is. The listings set their own. */
    class: className = '',
    children,
  } = $props();

  $effect(() => {
    pageTitle.set(title);
    return () => pageTitle.set(null);
  });
</script>

<article class={['reading', className].filter(Boolean).join(' ')}>
  {#if !$bandShowsTitle}<h1>{title}</h1>{/if}
  {#if dateline}<p class="dateline mono">{dateline}</p>{/if}
  {@render children?.()}
</article>

<style>
  .reading {
    /*
     * The column is the measure plus what the headings need, and the prose
     * inside it is held to the measure itself.
     */
    max-width: 72ch;
  }

  /* Page title: condensed 800 at 56 px, with the positive tracking the
     display face takes. docs/design/05-typography.md. */
  h1 {
    font-family: var(--display);
    font-stretch: 75%;
    font-variation-settings: "opsz" 96;
    font-weight: 800;
    font-size: 56px;
    line-height: 0.9;
    letter-spacing: 0.006em;
    color: var(--ink);
    margin: 0;
  }

  .dateline {
    font-size: 12.5px;
    color: var(--muted);
    margin: 14px 0 0;
  }

  /*
   * The prose is written by the page, so the roles are set from here. A
   * heading is condensed 800 at 30 px, and a sub heading is the event title
   * role at width 90, which is the next step down the display face takes.
   */
  .reading :global(h2) {
    font-family: var(--display);
    font-stretch: 75%;
    font-variation-settings: "opsz" 96;
    font-weight: 800;
    font-size: 30px;
    line-height: 1;
    letter-spacing: 0.006em;
    color: var(--ink);
    margin: 40px 0 0;
  }

  .reading :global(h3) {
    font-family: var(--display);
    font-stretch: 90%;
    font-variation-settings: "opsz" 96;
    font-weight: 700;
    font-size: 19px;
    line-height: 1.15;
    color: var(--ink);
    margin: 26px 0 0;
  }

  .reading :global(p),
  .reading :global(ul),
  .reading :global(ol) {
    font-family: var(--sans);
    font-size: 15px;
    line-height: 1.55;
    color: var(--ink-2);
    max-width: 62ch;
    margin: 12px 0 0;
  }

  .reading :global(ul),
  .reading :global(ol) {
    padding-left: 20px;
  }

  .reading :global(ul) {
    list-style: none;
  }

  .reading :global(ol) {
    list-style: decimal;
  }

  .reading :global(li) {
    margin-top: 6px;
    position: relative;
  }

  /*
   * The bullet is the pad, which is the shape the whole site marks things
   * with, rather than a disc from the browser.
   */
  .reading :global(ul > li)::before {
    content: "";
    position: absolute;
    left: -20px;
    top: 8px;
    width: 6px;
    height: 6px;
    border-radius: 1.5px;
    background: var(--line-strong);
    transform: rotate(45deg);
  }

  /* Anything a person might copy out of the page is set in the data face. */
  .reading :global(code) {
    font-family: var(--mono);
    font-size: 13.5px;
    color: var(--ink);
  }

  .reading :global(strong) {
    color: var(--ink);
    font-weight: 600;
  }

  /*
   * A link inside a sentence is set in the primary colour and underlined. A
   * button written as an anchor, which is what "Continue to Discord" on the
   * linking page is, is left out: it carries the colour its own variant gives
   * it, and this rule outranked that variant and painted the label in the
   * primary colour on the primary gradient, where nobody could read it.
   */
  .reading :global(a:not(.btn)) {
    color: var(--primary);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .reading :global(a:not(.btn):focus-visible) {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  @media (max-width: 640px) {
    h1 {
      font-size: 40px;
    }

    .reading :global(h2) {
      font-size: 26px;
    }
  }
</style>
