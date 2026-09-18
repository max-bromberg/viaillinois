<script>
  import { navigate } from './router.js';
  import { Icon, Mark } from './components/ui/index.js';

  /**
   * The foot of every page.
   *
   * It used to carry two captions in uppercase over its lists, which the voice
   * document rules out, and then two blocks of prose which said what the rest
   * of the page already says. One of them tied the platform to a building.
   * VIA serves a department's organizations, and a department is people rather
   * than an address, so the sign off names the people.
   *
   * The mark is drawn rather than loaded, because it is white on the night sky
   * and an image cannot be recoloured. See docs/design/07-components.md.
   */
  const PLACES = [
    { href: '/', label: 'Events' },
    { href: '/calendar', label: 'Calendar' },
    { href: '/midterms', label: 'Midterms' },
    { href: '/updates', label: 'Updates' },
    { href: '/about', label: 'About' },
  ];

  const BOTTOM = [
    { href: '/terms', label: 'Terms' },
    { href: '/privacy', label: 'Privacy' },
  ];

  const year = new Date().getFullYear();

  /** A link inside the site is followed without fetching the page again. */
  function follow(event, href) {
    event.preventDefault();
    navigate(href);
  }
</script>

<footer>
  <div class="inner">
    <div class="cols">
      <div class="brand">
        <Mark size={96} />
      </div>

      <nav aria-label="More of the site">
        {#each PLACES as place (place.href)}
          <a href={place.href} onclick={event => follow(event, place.href)}>{place.label}</a>
        {/each}
      </nav>
    </div>

    <div class="bottom">
      <p>&copy; {year} VIA, Virtually Integrated Agenda</p>
      <p class="right">
        {#each BOTTOM as place (place.href)}
          <a href={place.href} onclick={event => follow(event, place.href)}>{place.label}</a>
        {/each}
        <span class="signoff">Made with <Icon name="heart" class="heart" /><span class="only">love</span> for Illinois ECE</span>
        <span class="mono">v{__APP_VERSION__}</span>
      </p>
    </div>
  </div>
</footer>

<style>
  /*
   * A hairline rather than a panel: the footer is the same paper as the page,
   * told apart by the rule above it and by the space around it.
   */
  footer {
    border-top: 1px solid var(--line);
    margin-top: 56px;
  }

  .inner {
    max-width: var(--wrap);
    margin: 0 auto;
    padding: 36px 32px 40px;
  }

  .cols {
    display: flex;
    flex-wrap: wrap;
    gap: 24px 48px;
    align-items: center;
    justify-content: space-between;
  }

  .brand {
    display: grid;
    gap: 14px;
    justify-items: start;
  }

  /*
   * The places to go are set in the navigation role, as they are in the band,
   * and they run in a row there too. Down a column they took the height of
   * five lines to say what fits comfortably on one.
   */
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 26px;
    align-items: center;
  }

  nav a {
    font-family: var(--display);
    font-stretch: 85%;
    font-variation-settings: "opsz" 96;
    font-weight: 600;
    font-size: 15.5px;
    line-height: 1.2;
    color: var(--ink-2);
    text-decoration: none;
    /* Every control on the site can be hit, which is 32 px. */
    min-height: 32px;
    display: inline-flex;
    align-items: center;
  }

  nav a:hover {
    color: var(--ink);
  }

  .bottom {
    margin-top: 32px;
    padding-top: 16px;
    border-top: 1px solid var(--line);
    display: flex;
    flex-wrap: wrap;
    gap: 12px 18px;
    align-items: center;
    justify-content: space-between;
    font-size: 12.5px;
    color: var(--muted);
  }

  .bottom .right {
    display: flex;
    align-items: center;
    gap: 18px;
  }

  .bottom a {
    color: var(--muted);
    text-decoration: none;
    font-family: var(--display);
    font-stretch: 85%;
    font-weight: 600;
    font-size: 13.5px;
    min-height: 32px;
    display: inline-flex;
    align-items: center;
  }

  .bottom a:hover {
    color: var(--ink);
  }

  /* The sign off sits in the bottom row, beside the version it was written for. */
  .bottom .signoff {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  /* Drawn rather than typed, so it is the same shape on a phone and on the
     lobby screen. It takes the stroke weight of the mark's traces and the size
     of the words beside it. */
  .bottom :global(.heart) {
    color: var(--signal);
    font-size: 13px;
  }

  /* The word behind the character, for anybody reading the page rather than looking at it. */
  .only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  .bottom .mono {
    font-size: 12px;
  }

  a:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  @media (max-width: 860px) {
    .cols {
      grid-template-columns: 1fr;
      gap: 28px;
    }
  }

  @media (max-width: 640px) {
    .inner {
      padding: 28px 16px 32px;
    }
  }
</style>
