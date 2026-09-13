<script>
  import { Mark } from '../Mark/index.js';

  /**
   * The navigation.
   *
   * It lives in the sky band. The mark sits at the left with the site's full
   * name beside it, in the condensed display face, revealing itself on hover the
   * way it always has. The links are set in the display face and the page you
   * are on is set at 800 with a pad under it, which is the same shape as the day
   * marker and the checkbox.
   *
   * The page you are on is said in words as well as in weight, because meaning
   * never rides on colour or on weight alone.
   *
   * See docs/design/07-components.md and docs/design/08-surfaces.md.
   */
  let {
    /** Where the site can go, as a list of a path and a label. */
    links = [],
    /** Which path is open. */
    here = '/',
    /** On the night sky the mark is white. */
    onDark = false,
    /** What happens when a link is followed, so the client can route it. */
    onnavigate = undefined,
    class: className = '',
    children,
    ...rest
  } = $props();

  function follow(event, href) {
    if (!onnavigate) return;
    event.preventDefault();
    onnavigate(href);
  }
</script>

<nav class={['nav', className].filter(Boolean).join(' ')} aria-label="Main" {...rest}>
  <a class="home" href="/" onclick={event => follow(event, '/')}>
    <Mark size={58} {onDark} />
  </a>
  <span class="w">Virtually Integrated Agenda</span>
  <div class="links">
    {#each links as link (link.href)}
      {#if link.href === here}
        <b><a href={link.href} aria-current="page" onclick={event => follow(event, link.href)}>{link.label}</a></b>
      {:else}
        <span><a href={link.href} onclick={event => follow(event, link.href)}>{link.label}</a></span>
      {/if}
    {/each}
  </div>
  <div class="right">{@render children?.()}</div>
</nav>

<style>
  /*
   * The links carry the colour and the weight from the band's own rules, so an
   * anchor inside one takes neither a colour nor an underline of its own.
   */
  .links a,
  .home {
    color: inherit;
    text-decoration: none;
  }

  .links a:focus-visible,
  .home:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  .home {
    display: inline-flex;
  }
</style>
