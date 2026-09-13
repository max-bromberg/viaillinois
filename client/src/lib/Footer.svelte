<script>
  import { navigate } from './router.js';
  import { Mark } from './components/ui/index.js';

  /**
   * The foot of every page.
   *
   * It used to carry two captions in uppercase over its lists, and it signed
   * off with a heart character standing in for an icon. The voice document
   * rules out both, so the captions are gone and the sign off is the one the
   * voice document writes: made in the building, for the people who walk past
   * the lobby screen.
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
        <Mark size={64} />
        <p>
          Virtually Integrated Agenda, where the student organizations of the Electrical and
          Computer Engineering department at the University of Illinois Urbana-Champaign keep
          what is on.
        </p>
      </div>

      <nav aria-label="More of the site">
        {#each PLACES as place (place.href)}
          <a href={place.href} onclick={event => follow(event, place.href)}>{place.label}</a>
        {/each}
      </nav>

      <p class="signoff">
        Made in ECEB, for everyone who walks past the lobby screen. Kept by students, for
        students, and open to every organization in the department.
      </p>
    </div>

    <div class="bottom">
      <p>&copy; {year} VIA, Virtually Integrated Agenda</p>
      <p class="right">
        {#each BOTTOM as place (place.href)}
          <a href={place.href} onclick={event => follow(event, place.href)}>{place.label}</a>
        {/each}
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
    max-width: 1180px;
    margin: 0 auto;
    padding: 36px 32px 40px;
  }

  .cols {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1.2fr;
    gap: 40px;
    align-items: start;
  }

  .brand {
    display: grid;
    gap: 14px;
    justify-items: start;
  }

  .brand p,
  .signoff {
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--muted);
    max-width: 46ch;
  }

  /* The places to go are set in the navigation role, as they are in the band. */
  nav {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: start;
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
