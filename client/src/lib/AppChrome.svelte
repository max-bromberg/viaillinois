<script>
  import { SkyBand, Nav, Dial, Button } from './components/ui/index.js';
  import { themeMode } from '../stores/theme.js';
  import { currentUser, authResolved, isGlobalAdmin } from '../stores/auth.js';
  import { firstName } from './greeting.js';

  /**
   * The sky band, with everything the site puts in it.
   *
   * The navigation bar the site used to carry is gone. Where it sat there is now
   * a band of the campus sky at this hour holding the same places to go, the
   * theme control and the account controls, with the greeting and the clock
   * under them. Everything below the band is paper.
   *
   * See docs/design/08-surfaces.md.
   */
  let {
    /**
     * How much of the band this surface carries.
     *
     * The feed gets the greeting and the clock. A reading page, login and the
     * account page get a title in place of the greeting. Everything else gets
     * the navigation on paper and no band at all, which is what the reference
     * render draws for the event page, the midterm schedule and the board tools:
     * a sky over a page that is not the agenda would be answering a question
     * nobody asked there.
     */
    band = 'greeting',
    /** Which path is open. */
    here = '/',
    /** A page title, which stands in place of the greeting away from the feed. */
    title = null,
    /** The counts for the greeting line. */
    counts = { tonight: null, week: null, midterm: null },
    /** Where tonight's events are. */
    where = null,
    /** What happens when a link is followed. */
    onnavigate = undefined,
    /** What happens when somebody signs out. */
    onsignout = undefined,
  } = $props();

  /**
   * The band follows the campus hour rather than the theme, and it reads that
   * hour itself. What is passed here is only the instant, so that the band, the
   * greeting and the clock are all reading one clock.
   */
  let now = $state(new Date());

  $effect(() => {
    const tick = setInterval(() => { now = new Date(); }, 60000);
    return () => clearInterval(tick);
  });

  const LINKS = [
    { href: '/', label: 'Events' },
    { href: '/calendar', label: 'Calendar' },
    { href: '/organizations', label: 'Organizations' },
    { href: '/midterms', label: 'Midterms' },
    { href: '/notifications', label: 'Notifications' },
    { href: '/about', label: 'About' },
  ];

  /**
   * Everything above the divider is for anybody reading the site. The two below
   * it are for the people who run an organization, and the navigation says so by
   * keeping them apart rather than leaving them to read as more of the same.
   */
  const links = $derived([
    ...LINKS,
    ...($currentUser ? [{ href: '/dashboard', label: 'My organizations' }] : []),
    ...($isGlobalAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
  ]);

  const name = $derived(firstName($currentUser));
</script>

{#if band === 'bare'}
  <div class="bare">
    <Nav {links} {here} {onnavigate}>{@render bandControls()}</Nav>
  </div>
{:else}
  <SkyBand
    {links}
    {here}
    at={now}
    name={band === 'title' ? null : name}
    {title}
    tonight={band === 'title' ? null : counts.tonight}
    {where}
    week={band === 'title' ? null : counts.week}
    midterm={band === 'title' ? null : counts.midterm}
    {onnavigate}
  >
    {#snippet controls()}
      {@render bandControls()}
    {/snippet}
  </SkyBand>
{/if}

{#snippet bandControls()}
  <Dial mode={$themeMode} onchange={mode => themeMode.set(mode)} />
  <!--
    Nothing until the answer to who is looking arrives. Showing "Sign in" first
    and correcting it a moment later is a flicker on every page a signed in board
    member opens.
  -->
  {#if $authResolved}
    {#if $currentUser}
      <!--
        The person's own name, which is what the greeting under this already
        uses. The net id is an identifier the platform needs and not anything
        somebody calls themselves, so it stands in only where the directory has
        given us no name at all.
      -->
      <Button variant="quiet" size="sm" href="/account" onclick={() => onnavigate?.('/account')}>
        {name ?? $currentUser.net_id}
      </Button>
      <Button variant="secondary" size="sm" onclick={() => onsignout?.()}>Sign out</Button>
    {:else if here !== '/login'}
      <!--
        One primary button per screen. The login page is itself the way in, so
        the band does not offer a second one beside it.
      -->
      <Button variant="primary" size="sm" href="/login" onclick={() => onnavigate?.('/login')}>Sign in</Button>
    {/if}
  {/if}
{/snippet}

<style>
  /*
   * The navigation on paper. It keeps the band's own height and padding so that
   * the page below it begins where it does on the feed, and it takes no sky,
   * because the surfaces that draw it are not the agenda.
   */
  .bare {
    background: var(--paper);
  }
</style>
