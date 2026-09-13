<script>
  import { SkyBand, Dial, Button } from './components/ui/index.js';
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
    /** Which path is open. */
    here = '/',
    /** A page title, which stands in place of the greeting away from the feed. */
    title = null,
    /** The counts for the greeting line. */
    counts = { tonight: null, week: null, midterm: null },
    /** Where tonight's events are. */
    where = 'ECEB',
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
    { href: '/midterms', label: 'Midterms' },
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

<SkyBand
  {links}
  {here}
  at={now}
  {name}
  {title}
  tonight={counts.tonight}
  {where}
  week={counts.week}
  midterm={counts.midterm}
  {onnavigate}
>
  {#snippet controls()}
    <Dial mode={$themeMode} onchange={mode => themeMode.set(mode)} />
    <!--
      Nothing until the answer to who is looking arrives. Showing "Sign in"
      first and correcting it a moment later is a flicker on every page a signed
      in board member opens.
    -->
    {#if $authResolved}
      {#if $currentUser}
        <Button variant="quiet" size="sm" href="/account" onclick={() => onnavigate?.('/account')}>
          {$currentUser.net_id}
        </Button>
        <Button variant="secondary" size="sm" onclick={() => onsignout?.()}>Sign out</Button>
      {:else}
        <Button variant="primary" size="sm" href="/login" onclick={() => onnavigate?.('/login')}>Sign in</Button>
      {/if}
    {/if}
  {/snippet}
</SkyBand>
